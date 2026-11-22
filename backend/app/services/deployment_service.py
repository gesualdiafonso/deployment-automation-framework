"""Deployment operations: preview, confirmation, queue and agent hand-off.

The API never executes anything. This service only validates requests against
the official catalog, keeps the operation registry, and hands queued
operations to the separate PowerShell agent, which calls the engine.

Rules enforced here (approved in Day 5 Step 06):
- install/uninstall need a single-use confirmation token from a preview,
  valid for ``confirmation_ttl_seconds`` and bound to application, action, mode;
- new operations are refused while no Windows agent is online (503), and
  ``execute`` is refused while the agent has execution disabled (409);
- at most one operation runs at a time, and one is active per application;
- queued operations expire; claimed ones whose agent stops reporting become
  ``lost`` (outcome unknown: the machine must be checked).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.core.config import Settings, settings
from app.schemas.deployment import AgentHeartbeat, AgentResultRequest
from app.services.audit_log import AuditLog
from app.services.catalog_service import CatalogService
from app.services.operation_store import OperationStore

logger = logging.getLogger(__name__)

# Mirrors the engine (Get-DeployForgeDeploymentPlan): only these sources can be deployed.
SUPPORTED_SOURCES = frozenset({"winget", "msstore"})
ACTIVE_STATES = frozenset({"queued", "claimed"})
SUCCESS_ENGINE_STATUSES = frozenset({"Installed", "AlreadyInstalled", "Uninstalled", "NotInstalled", "DryRun"})


class DeploymentError(Exception):
    """A request the API refuses. ``status_code`` maps to the HTTP response."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class _PendingConfirmation:
    application_id: str
    action: str
    mode: str
    expires_at: datetime


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AgentToken:
    """Bearer token for the agent, rotated on every API start.

    Written to a file in the user's profile so only that user's agent can read
    it. The token itself is never logged.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._token: str | None = None

    def rotate(self) -> None:
        token = secrets.token_urlsafe(32)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_name(self.path.name + ".tmp")
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="ascii") as handle:
            handle.write(token)
        os.replace(temp, self.path)
        self._token = token

    def verify(self, candidate: str) -> bool:
        if self._token is None:
            return False
        return hmac.compare_digest(candidate.encode("utf-8"), self._token.encode("utf-8"))


class DeploymentService:
    def __init__(
        self,
        config: Settings = settings,
        catalog: CatalogService | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config
        self.catalog = catalog or CatalogService()
        self.store = OperationStore(config.operations_path)
        self.audit = AuditLog(config.audit_log_path)
        self.agent_token = AgentToken(config.agent_token_path)
        self._now = clock or (lambda: datetime.now(UTC))
        self._lock = threading.RLock()
        self._confirmations: dict[str, _PendingConfirmation] = {}
        self._heartbeat: dict[str, Any] | None = None
        self._last_heartbeat_at: datetime | None = None

    # --- agent status ---------------------------------------------------------

    def _agent_state(self) -> str:
        if self._heartbeat is None or self._last_heartbeat_at is None:
            return "never_seen"
        age = (self._now() - self._last_heartbeat_at).total_seconds()
        if age > self.config.agent_offline_after_seconds:
            return "offline"
        return "online" if self._heartbeat["platform"] == "windows" else "unsupported"

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            operations = self._maintain()
            heartbeat = self._heartbeat or {}
            return {
                "agent": {
                    "state": self._agent_state(),
                    "last_heartbeat_at": _iso(self._last_heartbeat_at),
                    "platform": heartbeat.get("platform"),
                    "os_version": heartbeat.get("os_version"),
                    "powershell_version": heartbeat.get("powershell_version"),
                    "engine_version": heartbeat.get("engine_version"),
                    "elevated": heartbeat.get("elevated"),
                    "winget": heartbeat.get("winget"),
                    "execute_enabled": heartbeat.get("execute_enabled"),
                },
                "queue": {
                    "queued": sum(1 for op in operations if op["state"] == "queued"),
                    "running": sum(1 for op in operations if op["state"] == "claimed"),
                },
            }

    def record_heartbeat(self, heartbeat: AgentHeartbeat) -> None:
        with self._lock:
            was_online = self._agent_state() == "online"
            self._heartbeat = heartbeat.model_dump()
            self._last_heartbeat_at = self._now()
            if not was_online:
                self.audit.write("agent_online", agent_id=heartbeat.agent_id)
            self._maintain()

    def _agent_blocker(self, mode: str | None) -> tuple[int, str] | None:
        """(HTTP status, reason) when an operation cannot be accepted now, else None."""
        state = self._agent_state()
        if state == "unsupported":
            return 409, "Deployments are not supported on this platform: the agent is not running on Windows."
        if state != "online":
            return 503, "No deployment agent is online. Start the DeployForge agent and try again."
        heartbeat = self._heartbeat or {}
        if not (heartbeat.get("winget") or {}).get("available"):
            return 409, "WinGet is not available on the agent's machine."
        if mode == "execute" and not heartbeat.get("execute_enabled"):
            return 409, "Real execution is disabled on the agent (DEPLOYFORGE_AGENT_ALLOW_EXECUTE is not set)."
        return None

    # --- preview and confirmation --------------------------------------------

    def _application(self, application_id: str) -> dict[str, Any]:
        application = self.catalog.get_application_by_id(application_id)
        if application is None:
            raise DeploymentError(404, f"Application '{application_id}' not found.")
        return application

    def preview(self, application_id: str, action: str, mode: str) -> dict[str, Any]:
        application = self._application(application_id)
        source = application["source"]["type"]
        supported = source in SUPPORTED_SOURCES
        notes: list[str] = []
        warnings: list[str] = []

        if not supported:
            notes.append(f"Source type '{source}' is not supported by the engine yet.")
        if mode == "dry_run":
            notes.append("Dry run: the engine runs with -WhatIf. Nothing is installed or uninstalled.")
        else:
            warnings.append(
                "Real execution: winget will "
                + ("install" if action == "install" else "remove")
                + f" {application['name']} on the agent's machine."
            )
            if action == "uninstall":
                warnings.append("The software and possibly its data will be removed from the machine.")

        with self._lock:
            self._purge_confirmations()
            blocker = self._agent_blocker(mode)
            heartbeat = self._heartbeat or {}
            if mode == "execute" and blocker is None and not heartbeat.get("elevated"):
                warnings.append(
                    "The agent is not elevated. Installers that need administrator rights will fail or ask for UAC."
                )
            if blocker:
                notes.append(blocker[1])

            token: str | None = None
            expires_at: datetime | None = None
            if supported:
                token = secrets.token_urlsafe(32)
                expires_at = self._now() + timedelta(seconds=self.config.confirmation_ttl_seconds)
                self._confirmations[_hash(token)] = _PendingConfirmation(application_id, action, mode, expires_at)

        return {
            "application": application,
            "action": action,
            "mode": mode,
            "supported": supported,
            "notes": notes,
            "warnings": warnings,
            "agent_ready": blocker is None,
            "confirmation_token": token,
            "expires_at": _iso(expires_at),
        }

    def _purge_confirmations(self) -> None:
        now = self._now()
        for key in [key for key, value in self._confirmations.items() if value.expires_at <= now]:
            del self._confirmations[key]

    def _consume_confirmation(self, token: str, application_id: str, action: str, mode: str) -> None:
        self._purge_confirmations()
        pending = self._confirmations.pop(_hash(token), None)
        if pending is None:
            raise DeploymentError(403, "The confirmation is invalid, expired or already used. Request a new preview.")
        if (pending.application_id, pending.action, pending.mode) != (application_id, action, mode):
            raise DeploymentError(403, "The confirmation does not match this application, action and mode.")

    # --- operations -----------------------------------------------------------

    def create_operation(
        self,
        application_id: str,
        action: str,
        mode: str | None,
        confirmation_token: str | None,
        origin: str | None,
    ) -> dict[str, Any]:
        application = self._application(application_id)
        if application["source"]["type"] not in SUPPORTED_SOURCES:
            raise DeploymentError(409, f"Source type '{application['source']['type']}' is not supported by the engine.")

        with self._lock:
            operations = self._maintain()
            blocker = self._agent_blocker(mode)
            if blocker:
                raise DeploymentError(*blocker)
            if any(op["application_id"] == application_id and op["state"] in ACTIVE_STATES for op in operations):
                raise DeploymentError(409, f"An operation for '{application_id}' is already queued or running.")
            if action != "detect":
                assert confirmation_token is not None and mode is not None  # enforced by the schema
                self._consume_confirmation(confirmation_token, application_id, action, mode)

            operation = {
                "operation_id": str(uuid.uuid4()),
                "application_id": application_id,
                "application_name": application["name"],
                "action": action,
                "mode": mode,
                "state": "queued",
                "created_at": _iso(self._now()),
                "claimed_at": None,
                "finished_at": None,
                "result": None,
                "error": None,
            }
            self.audit.write(
                "operation_requested",
                operation_id=operation["operation_id"],
                application_id=application_id,
                action=action,
                mode=mode,
                state="queued",
                origin=origin,
            )
            operations.append(operation)
            self._save(operations)
            return operation

    def list_operations(self, state: str | None, limit: int) -> dict[str, Any]:
        with self._lock:
            operations = self._maintain()
        selected = [op for op in reversed(operations) if state is None or op["state"] == state]
        return {"operations": selected[:limit], "total": len(selected)}

    def get_operation(self, operation_id: str) -> dict[str, Any]:
        with self._lock:
            for operation in self._maintain():
                if operation["operation_id"] == operation_id:
                    return operation
        raise DeploymentError(404, f"Operation '{operation_id}' not found.")

    def cancel_operation(self, operation_id: str, origin: str | None) -> dict[str, Any]:
        with self._lock:
            operations = self._maintain()
            operation = next((op for op in operations if op["operation_id"] == operation_id), None)
            if operation is None:
                raise DeploymentError(404, f"Operation '{operation_id}' not found.")
            if operation["state"] != "queued":
                raise DeploymentError(
                    409, f"Only queued operations can be cancelled; this one is '{operation['state']}'."
                )
            self._finish(operation, "cancelled", "operation_cancelled", origin=origin)
            self._save(operations)
            return operation

    # --- agent hand-off -------------------------------------------------------

    def claim(self, agent_id: str) -> dict[str, Any] | None:
        with self._lock:
            operations = self._maintain()
            if any(op["state"] == "claimed" for op in operations):
                return None
            operation = next((op for op in operations if op["state"] == "queued"), None)
            if operation is None:
                return None
            if operation["mode"] == "execute" and not (self._heartbeat or {}).get("execute_enabled"):
                # Execution was disabled after the request was accepted: never run it.
                self._finish(operation, "failed", "operation_failed", agent_id=agent_id)
                operation["error"] = "Real execution was disabled on the agent before the operation started."
                self._save(operations)
                return None
            operation["state"] = "claimed"
            operation["claimed_at"] = _iso(self._now())
            self.audit.write(
                "operation_claimed",
                operation_id=operation["operation_id"],
                application_id=operation["application_id"],
                action=operation["action"],
                mode=operation["mode"],
                state="claimed",
                agent_id=agent_id,
            )
            self._save(operations)
            return {key: operation[key] for key in ("operation_id", "application_id", "action", "mode")}

    def record_result(self, operation_id: str, report: AgentResultRequest, agent_id: str | None) -> dict[str, Any]:
        with self._lock:
            operations = self._maintain()
            operation = next((op for op in operations if op["operation_id"] == operation_id), None)
            if operation is None:
                raise DeploymentError(404, f"Operation '{operation_id}' not found.")
            if operation["state"] != "claimed":
                raise DeploymentError(409, f"Operation '{operation_id}' is '{operation['state']}', not running.")

            if report.error is not None:
                operation["error"] = report.error
                self._finish(operation, "failed", "operation_failed", agent_id=agent_id)
            else:
                assert report.result is not None
                result = report.result.model_dump()
                operation["result"] = result
                failed = result["engine_status"] is not None and result["engine_status"] not in SUCCESS_ENGINE_STATUSES
                if operation["action"] == "detect" and result["detected_installed"] is None:
                    failed = True
                self._finish(
                    operation,
                    "failed" if failed else "completed",
                    "operation_failed" if failed else "operation_completed",
                    agent_id=agent_id,
                )
            self._save(operations)
            return operation

    # --- housekeeping ---------------------------------------------------------

    def _finish(self, operation: dict[str, Any], state: str, event: str, **extra: Any) -> None:
        operation["state"] = state
        operation["finished_at"] = _iso(self._now())
        result = operation.get("result") or {}
        self.audit.write(
            event,
            operation_id=operation["operation_id"],
            application_id=operation["application_id"],
            action=operation["action"],
            mode=operation["mode"],
            state=state,
            engine_status=result.get("engine_status"),
            exit_code=result.get("exit_code"),
            engine_operation_id=result.get("engine_operation_id"),
            log_file=result.get("log_file"),
            **extra,
        )

    def _maintain(self) -> list[dict[str, Any]]:
        """Load operations and apply expiry rules. Saves only when something changed."""
        operations = self.store.load()
        now = self._now()
        changed = False
        heartbeat_age = (now - self._last_heartbeat_at).total_seconds() if self._last_heartbeat_at else None

        for operation in operations:
            if operation["state"] == "queued":
                age = (now - datetime.fromisoformat(operation["created_at"])).total_seconds()
                if age > self.config.queued_ttl_seconds:
                    operation["error"] = "No agent took the operation in time."
                    self._finish(operation, "expired", "operation_expired", reason="not claimed in time")
                    changed = True
            elif operation["state"] == "claimed":
                claimed_age = (now - datetime.fromisoformat(operation["claimed_at"])).total_seconds()
                silent = heartbeat_age is None or heartbeat_age > self.config.operation_lost_after_seconds
                if silent and claimed_age > self.config.operation_lost_after_seconds:
                    operation["error"] = (
                        "The agent stopped reporting while the operation was running. "
                        "Its outcome is unknown: check the machine (Detect) before retrying."
                    )
                    self._finish(operation, "lost", "operation_lost", reason="agent heartbeat stopped")
                    changed = True

        if len(operations) > self.config.operation_retention:
            finished = [op for op in operations if op["state"] not in ACTIVE_STATES]
            drop = {op["operation_id"] for op in finished[: len(operations) - self.config.operation_retention]}
            operations = [op for op in operations if op["operation_id"] not in drop]
            changed = True

        if changed:
            self._save(operations)
        return operations

    def _save(self, operations: list[dict[str, Any]]) -> None:
        self.store.save(operations)


_service: DeploymentService | None = None
_service_lock = threading.Lock()


def get_deployment_service() -> DeploymentService:
    """The process-wide service (one registry, one lock). Overridable in tests."""
    global _service
    with _service_lock:
        if _service is None:
            _service = DeploymentService()
            _service.agent_token.rotate()
            logger.info("Deployment agent token written to the user profile.")
        return _service

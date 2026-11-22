"""Deployment and agent interfaces (Day 5 Step 06/07).

The API must only register and hand over operations: it never executes a
process. Every test uses the isolated service from conftest.py.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.deployment_service import DeploymentService, get_deployment_service
from conftest import make_deployment_settings

ORIGIN = "http://127.0.0.1:5173"
UI_HEADERS = {"Origin": ORIGIN, "X-DeployForge-Request": "1"}
BASE = "/api/v1/deployment"
AGENT = "/api/v1/agent"


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def service(tmp_path: Path, clock: Clock) -> Iterator[DeploymentService]:
    instance = DeploymentService(make_deployment_settings(tmp_path), clock=clock)
    instance.agent_token.rotate()
    app.dependency_overrides[get_deployment_service] = lambda: instance
    yield instance


@pytest.fixture
def client(service: DeploymentService) -> TestClient:
    return TestClient(app, base_url="http://127.0.0.1:8000")


def agent_headers(service: DeploymentService) -> dict[str, str]:
    token = service.agent_token.path.read_text(encoding="ascii")
    return {"Authorization": f"Bearer {token}", "X-DeployForge-Agent-Id": "agent-1"}


def heartbeat(client: TestClient, service: DeploymentService, **overrides: Any) -> None:
    body = {
        "agent_id": "agent-1",
        "platform": "windows",
        "os_version": "Microsoft Windows NT 10.0.26200.0",
        "powershell_version": "7.6.10",
        "engine_version": "0.5.0",
        "elevated": False,
        "winget": {"available": True, "version": "v1.12.0"},
        "execute_enabled": False,
    }
    body.update(overrides)
    response = client.post(f"{AGENT}/heartbeat", json=body, headers=agent_headers(service))
    assert response.status_code == 204, response.text


def preview(client: TestClient, app_id: str = "7zip", action: str = "install", mode: str = "dry_run"):
    return client.post(
        f"{BASE}/preview", json={"application_id": app_id, "action": action, "mode": mode}, headers=UI_HEADERS
    )


def request_operation(client: TestClient, app_id: str = "7zip", action: str = "install", mode: str = "dry_run"):
    token = preview(client, app_id, action, mode).json()["confirmation_token"]
    return client.post(
        f"{BASE}/operations",
        json={"application_id": app_id, "action": action, "mode": mode, "confirmation_token": token},
        headers=UI_HEADERS,
    )


def audit_lines(service: DeploymentService) -> list[dict[str, Any]]:
    path = service.config.audit_log_path
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []


# --- status ---------------------------------------------------------------------


def test_status_before_any_heartbeat(client: TestClient) -> None:
    body = client.get(f"{BASE}/status").json()
    assert body["agent"]["state"] == "never_seen"
    assert body["agent"]["platform"] is None
    assert body["queue"] == {"queued": 0, "running": 0}


def test_status_online_then_offline(client: TestClient, service: DeploymentService, clock: Clock) -> None:
    heartbeat(client, service)
    agent = client.get(f"{BASE}/status").json()["agent"]
    assert agent["state"] == "online"
    assert agent["winget"] == {"available": True, "version": "v1.12.0"}
    clock.advance(31)
    assert client.get(f"{BASE}/status").json()["agent"]["state"] == "offline"


def test_silent_non_windows_agent_becomes_offline(client: TestClient, service: DeploymentService, clock: Clock) -> None:
    heartbeat(client, service, platform="macos", winget={"available": False, "version": None})
    clock.advance(31)
    assert client.get(f"{BASE}/status").json()["agent"]["state"] == "offline"


def test_non_windows_agent_is_unsupported(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service, platform="macos", winget={"available": False, "version": None})
    assert client.get(f"{BASE}/status").json()["agent"]["state"] == "unsupported"
    response = preview(client)
    assert response.json()["agent_ready"] is False
    token = response.json()["confirmation_token"]
    created = client.post(
        f"{BASE}/operations",
        json={"application_id": "7zip", "action": "install", "mode": "dry_run", "confirmation_token": token},
        headers=UI_HEADERS,
    )
    assert created.status_code == 409


# --- request checks (CSRF, origin, host) -------------------------------------------


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-DeployForge-Request": "1"},
        {"Origin": ORIGIN},
        {"Origin": "https://evil.example", "X-DeployForge-Request": "1"},
        {"Origin": "null", "X-DeployForge-Request": "1"},
        {"Origin": ORIGIN, "X-DeployForge-Request": "0"},
    ],
)
def test_ui_writes_need_allowed_origin_and_csrf_header(client: TestClient, headers: dict[str, str]) -> None:
    body = {"application_id": "7zip", "action": "install", "mode": "dry_run"}
    assert client.post(f"{BASE}/preview", json=body, headers=headers).status_code == 403


def test_non_loopback_host_is_rejected(service: DeploymentService) -> None:
    rebinding = TestClient(app, base_url="http://attacker.example:8000")
    assert rebinding.get(f"{BASE}/status").status_code == 403
    assert rebinding.post(f"{BASE}/preview", json={}, headers=UI_HEADERS).status_code == 403


def test_existing_catalog_endpoints_are_not_host_restricted() -> None:
    assert TestClient(app).get("/api/v1/applications/7zip").status_code == 200


def test_get_never_creates_operations(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    client.get(f"{BASE}/operations")
    client.get(f"{BASE}/status")
    assert client.get(f"{BASE}/operations").json()["total"] == 0


# --- preview and confirmation -----------------------------------------------------


def test_preview_returns_catalog_record_and_token(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    body = preview(client).json()
    assert body["application"]["id"] == "7zip"
    assert body["supported"] is True
    assert body["agent_ready"] is True
    assert len(body["confirmation_token"]) >= 40
    assert any("-WhatIf" in note for note in body["notes"])


def test_preview_execute_warns_and_reports_disabled_execution(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    body = preview(client, action="uninstall", mode="execute").json()
    assert body["agent_ready"] is False
    assert any("disabled" in note for note in body["notes"])
    assert any("removed" in warning for warning in body["warnings"])


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"application_id": "not-in-catalog", "action": "install", "mode": "dry_run"}, 404),
        ({"application_id": "Google.Chrome", "action": "install", "mode": "dry_run"}, 422),
        ({"application_id": "7zip", "action": "detect", "mode": "dry_run"}, 422),
        ({"application_id": "7zip", "action": "rm -rf", "mode": "dry_run"}, 422),
        ({"application_id": "7zip", "action": "install", "mode": "now"}, 422),
        ({"application_id": "7zip", "action": "install", "mode": "dry_run", "command": "calc.exe"}, 422),
        ({"application_id": "7zip", "action": "install", "mode": "dry_run", "package_id": "Evil.Pkg"}, 422),
    ],
)
def test_preview_rejects_invalid_input(client: TestClient, body: dict[str, str], status: int) -> None:
    assert client.post(f"{BASE}/preview", json=body, headers=UI_HEADERS).status_code == status


def test_token_is_single_use(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    token = preview(client).json()["confirmation_token"]
    body = {"application_id": "7zip", "action": "install", "mode": "dry_run", "confirmation_token": token}
    first = client.post(f"{BASE}/operations", json=body, headers=UI_HEADERS)
    assert first.status_code == 202
    # Free the application so only the token can stop the second request.
    client.post(f"{BASE}/operations/{first.json()['operation_id']}/cancel", headers=UI_HEADERS)
    second = client.post(f"{BASE}/operations", json=body, headers=UI_HEADERS)
    assert second.status_code == 403
    assert "already used" in second.json()["detail"]


def test_token_expires(client: TestClient, service: DeploymentService, clock: Clock) -> None:
    heartbeat(client, service)
    token = preview(client).json()["confirmation_token"]
    clock.advance(121)
    heartbeat(client, service)
    body = {"application_id": "7zip", "action": "install", "mode": "dry_run", "confirmation_token": token}
    assert client.post(f"{BASE}/operations", json=body, headers=UI_HEADERS).status_code == 403


@pytest.mark.parametrize(
    "change",
    [{"application_id": "git"}, {"action": "uninstall"}, {"mode": "execute"}],
)
def test_token_is_bound_to_application_action_and_mode(
    client: TestClient, service: DeploymentService, change: dict[str, str]
) -> None:
    heartbeat(client, service, execute_enabled=True)
    token = preview(client).json()["confirmation_token"]
    body = {"application_id": "7zip", "action": "install", "mode": "dry_run", "confirmation_token": token}
    body.update(change)
    assert client.post(f"{BASE}/operations", json=body, headers=UI_HEADERS).status_code == 403


def test_install_without_token_is_rejected(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    body = {"application_id": "7zip", "action": "install", "mode": "dry_run"}
    assert client.post(f"{BASE}/operations", json=body, headers=UI_HEADERS).status_code == 422


def test_detect_needs_no_token_but_rejects_mode(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    ok = client.post(f"{BASE}/operations", json={"application_id": "7zip", "action": "detect"}, headers=UI_HEADERS)
    assert ok.status_code == 202
    assert ok.json()["mode"] is None
    bad = client.post(
        f"{BASE}/operations", json={"application_id": "git", "action": "detect", "mode": "execute"}, headers=UI_HEADERS
    )
    assert bad.status_code == 422


# --- operation rules -----------------------------------------------------------------


def test_agent_offline_rejects_new_operations(client: TestClient, service: DeploymentService, clock: Clock) -> None:
    heartbeat(client, service)
    token = preview(client).json()["confirmation_token"]
    clock.advance(31)
    body = {"application_id": "7zip", "action": "install", "mode": "dry_run", "confirmation_token": token}
    assert client.post(f"{BASE}/operations", json=body, headers=UI_HEADERS).status_code == 503


def test_execute_rejected_while_agent_disables_it(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service, execute_enabled=False)
    assert request_operation(client, mode="execute").status_code == 409


def test_one_active_operation_per_application(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    assert request_operation(client).status_code == 202
    assert request_operation(client).status_code == 409
    assert request_operation(client, app_id="git").status_code == 202


def test_cancel_only_queued(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    first = request_operation(client).json()["operation_id"]
    cancelled = client.post(f"{BASE}/operations/{first}/cancel", headers=UI_HEADERS)
    assert cancelled.json()["state"] == "cancelled"
    assert client.post(f"{BASE}/operations/{first}/cancel", headers=UI_HEADERS).status_code == 409

    second = request_operation(client).json()["operation_id"]
    client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    assert client.post(f"{BASE}/operations/{second}/cancel", headers=UI_HEADERS).status_code == 409


def test_cancel_needs_csrf_protection(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    assert client.post(f"{BASE}/operations/{operation_id}/cancel").status_code == 403


def test_unknown_operation_is_404(client: TestClient) -> None:
    assert client.get(f"{BASE}/operations/does-not-exist").status_code == 404


# --- agent interface ----------------------------------------------------------------


def test_agent_needs_token_and_rejects_browsers(client: TestClient, service: DeploymentService) -> None:
    assert client.post(f"{AGENT}/operations/claim").status_code == 401
    assert client.post(f"{AGENT}/operations/claim", headers={"Authorization": "Bearer wrong"}).status_code == 401
    with_origin = {**agent_headers(service), "Origin": ORIGIN}
    assert client.post(f"{AGENT}/operations/claim", headers=with_origin).status_code == 403


def test_claim_serializes_and_hands_only_typed_values(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    request_operation(client)
    request_operation(client, app_id="git")
    claimed = client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    assert claimed.status_code == 200
    assert set(claimed.json()) == {"operation_id", "application_id", "action", "mode"}
    assert claimed.json()["application_id"] == "7zip"
    # One operation runs at a time.
    assert client.post(f"{AGENT}/operations/claim", headers=agent_headers(service)).status_code == 204


def result_body(**overrides: Any) -> dict[str, Any]:
    result = {
        "engine_status": "DryRun",
        "exit_code": None,
        "verified": None,
        "detected_installed": None,
        "message": "What if: winget install --id 7zip.7zip",
        "engine_operation_id": "1a2b3c4d",
        "log_file": None,
    }
    result.update(overrides)
    return {"result": result}


@pytest.mark.parametrize(
    ("engine_status", "expected_state"),
    [
        ("DryRun", "completed"),
        ("Installed", "completed"),
        ("AlreadyInstalled", "completed"),
        ("Uninstalled", "completed"),
        ("NotInstalled", "completed"),
        ("Failed", "failed"),
        ("Skipped", "failed"),
    ],
)
def test_result_maps_engine_status(
    client: TestClient, service: DeploymentService, engine_status: str, expected_state: str
) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    response = client.post(
        f"{AGENT}/operations/{operation_id}/result",
        json=result_body(engine_status=engine_status, exit_code=0),
        headers=agent_headers(service),
    )
    assert response.status_code == 200
    assert response.json()["state"] == expected_state
    assert response.json()["result"]["exit_code"] == 0


def test_engine_exception_is_failed(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    response = client.post(
        f"{AGENT}/operations/{operation_id}/result",
        json={"error": "winget was not found on this machine."},
        headers=agent_headers(service),
    )
    assert response.json()["state"] == "failed"
    assert response.json()["error"] == "winget was not found on this machine."


def test_detect_result(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    created = client.post(
        f"{BASE}/operations", json={"application_id": "7zip", "action": "detect"}, headers=UI_HEADERS
    ).json()
    client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    done = client.post(
        f"{AGENT}/operations/{created['operation_id']}/result",
        json=result_body(engine_status=None, detected_installed=True, engine_operation_id=None, message="Installed."),
        headers=agent_headers(service),
    ).json()
    assert done["state"] == "completed"
    assert done["result"]["detected_installed"] is True


@pytest.mark.parametrize(
    "bad",
    [
        {"log_file": "C:\\Users\\someone\\logs\\x.log"},
        {"log_file": "../../etc/passwd.log"},
        {"engine_operation_id": "not-hex!"},
        {"engine_status": "Hacked"},
    ],
)
def test_result_rejects_paths_and_unknown_values(client: TestClient, service: DeploymentService, bad: dict) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    response = client.post(
        f"{AGENT}/operations/{operation_id}/result", json=result_body(**bad), headers=agent_headers(service)
    )
    assert response.status_code == 422


def test_result_only_for_running_operation(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    response = client.post(
        f"{AGENT}/operations/{operation_id}/result", json=result_body(), headers=agent_headers(service)
    )
    assert response.status_code == 409


# --- expiry ---------------------------------------------------------------------------


def test_queued_operation_expires(client: TestClient, service: DeploymentService, clock: Clock) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    clock.advance(601)
    assert client.get(f"{BASE}/operations/{operation_id}").json()["state"] == "expired"


def test_running_operation_is_lost_when_agent_goes_silent(
    client: TestClient, service: DeploymentService, clock: Clock
) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    clock.advance(30)
    heartbeat(client, service, current_operation_id=operation_id)
    clock.advance(45)
    assert client.get(f"{BASE}/operations/{operation_id}").json()["state"] == "claimed"
    clock.advance(30)
    operation = client.get(f"{BASE}/operations/{operation_id}").json()
    assert operation["state"] == "lost"
    assert "unknown" in operation["error"]


def test_execute_disabled_after_queueing_never_runs(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service, execute_enabled=True)
    operation_id = request_operation(client, mode="execute").json()["operation_id"]
    heartbeat(client, service, execute_enabled=False)
    assert client.post(f"{AGENT}/operations/claim", headers=agent_headers(service)).status_code == 204
    assert client.get(f"{BASE}/operations/{operation_id}").json()["state"] == "failed"


# --- persistence and audit ------------------------------------------------------------


def test_registry_survives_a_new_service_instance(
    client: TestClient, service: DeploymentService, tmp_path: Path, clock: Clock
) -> None:
    heartbeat(client, service)
    operation_id = request_operation(client).json()["operation_id"]
    reloaded = DeploymentService(make_deployment_settings(tmp_path), clock=clock)
    assert reloaded.get_operation(operation_id)["state"] == "queued"


def test_corrupt_registry_is_a_500_and_is_not_overwritten(client: TestClient, service: DeploymentService) -> None:
    path = service.config.operations_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{ not json", encoding="utf-8")
    response = client.get(f"{BASE}/operations")
    assert response.status_code == 500
    assert response.json() == {"detail": "The deployment registry is unavailable."}
    assert path.read_text(encoding="utf-8") == "{ not json"


def test_audit_log_records_lifecycle_without_secrets(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    token = preview(client).json()["confirmation_token"]
    body = {"application_id": "7zip", "action": "install", "mode": "dry_run", "confirmation_token": token}
    operation_id = client.post(f"{BASE}/operations", json=body, headers=UI_HEADERS).json()["operation_id"]
    client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
    client.post(f"{AGENT}/operations/{operation_id}/result", json=result_body(), headers=agent_headers(service))

    events = [line["event"] for line in audit_lines(service)]
    assert events == ["agent_online", "operation_requested", "operation_claimed", "operation_completed"]
    requested = audit_lines(service)[1]
    assert requested["origin"] == ORIGIN and requested["operation_id"] == operation_id

    raw = service.config.audit_log_path.read_text(encoding="utf-8")
    agent_token = service.agent_token.path.read_text(encoding="ascii")
    assert token not in raw
    assert agent_token not in raw
    assert "Bearer" not in raw


def test_api_never_starts_processes(client: TestClient, service: DeploymentService) -> None:
    events: list[str] = []

    def hook(event: str, _args: tuple) -> None:
        if event.startswith(("subprocess.", "os.system", "os.exec", "os.posix_spawn", "os.spawn", "os.startfile")):
            events.append(event)

    sys.addaudithook(hook)
    heartbeat(client, service, execute_enabled=True)
    for action, mode in (("install", "dry_run"), ("uninstall", "execute")):
        operation_id = request_operation(client, action=action, mode=mode).json()["operation_id"]
        client.post(f"{AGENT}/operations/claim", headers=agent_headers(service))
        client.post(f"{AGENT}/operations/{operation_id}/result", json=result_body(), headers=agent_headers(service))
    client.post(f"{BASE}/operations", json={"application_id": "git", "action": "detect"}, headers=UI_HEADERS)
    assert events == []


def test_agent_token_file_is_written_and_rotated(service: DeploymentService) -> None:
    first = service.agent_token.path.read_text(encoding="ascii")
    service.agent_token.rotate()
    second = service.agent_token.path.read_text(encoding="ascii")
    assert first != second
    assert not service.agent_token.verify(first)
    assert service.agent_token.verify(second)


# --- audit log endpoint ------------------------------------------------------------


def test_audit_endpoint_returns_records_newest_first(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    first = request_operation(client).json()["operation_id"]
    request_operation(client, app_id="git")
    body = client.get(f"{BASE}/audit").json()
    assert body["total"] == 3
    assert [record["event"] for record in body["records"]] == [
        "operation_requested",
        "operation_requested",
        "agent_online",
    ]
    only_first = client.get(f"{BASE}/audit", params={"operation_id": first}).json()
    assert [record["operation_id"] for record in only_first["records"]] == [first]


def test_audit_endpoint_empty_without_file(client: TestClient) -> None:
    assert client.get(f"{BASE}/audit").json() == {"records": [], "total": 0, "skipped_lines": 0, "truncated": False}


def test_audit_endpoint_drops_unknown_fields_and_bad_lines(client: TestClient, service: DeploymentService) -> None:
    path = service.config.audit_log_path
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        json.dumps({"timestamp": "t1", "event": "operation_requested", "secret": "hunter2", "exit_code": "x"}),
        "not json",
        json.dumps(["list"]),
        json.dumps({"event": "missing timestamp"}),
        json.dumps({"timestamp": "t2", "event": "operation_completed", "exit_code": -1978335212}),
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
    body = client.get(f"{BASE}/audit").json()
    assert body["skipped_lines"] == 3
    newest, oldest = body["records"]
    assert (newest["timestamp"], newest["event"], newest["exit_code"]) == ("t2", "operation_completed", -1978335212)
    assert (oldest["timestamp"], oldest["event"], oldest["exit_code"]) == ("t1", "operation_requested", None)
    assert "hunter2" not in json.dumps(body)
    assert "secret" not in oldest


def test_audit_endpoint_limit_and_host_check(client: TestClient, service: DeploymentService) -> None:
    heartbeat(client, service)
    for app_id in ("7zip", "git", "gimp"):
        request_operation(client, app_id=app_id)
    assert len(client.get(f"{BASE}/audit", params={"limit": 2}).json()["records"]) == 2
    assert client.get(f"{BASE}/audit", params={"limit": 0}).status_code == 422
    assert TestClient(app, base_url="http://evil.example").get(f"{BASE}/audit").status_code == 403

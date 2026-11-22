"""Centralised, typed application settings."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# backend/app/core/config.py -> parents[3] is the repository root. Resolving from
# this file (not from the current working directory) keeps paths stable no
# matter where the process is started from.
PROJECT_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_ALLOWED_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173")


def _allowed_origins_from_env() -> tuple[str, ...]:
    """Origins allowed to request deployments (comma-separated env override)."""
    raw = os.environ.get("DEPLOYFORGE_ALLOWED_ORIGINS", "")
    origins = tuple(item.strip().rstrip("/") for item in raw.split(",") if item.strip())
    return origins or DEFAULT_ALLOWED_ORIGINS


def _default_agent_token_path() -> Path:
    """Agent token file inside the user's profile (only that user can read it)."""
    override = os.environ.get("DEPLOYFORGE_AGENT_TOKEN_FILE")
    if override:
        return Path(override)
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "DeployForge" / "agent.token"
    return Path.home() / ".local" / "state" / "deployforge" / "agent.token"


@dataclass(frozen=True, slots=True)
class Settings:
    """Static metadata and configuration for the DeployForge API.

    Immutable by design. Tests that need different paths should build their own
    instance (``Settings(catalog_path=...)`` or ``dataclasses.replace``) or pass
    the paths straight to the service, instead of mutating ``settings``.
    """

    app_name: str = "DeployForge API"
    version: str = "0.1.0"
    description: str = (
        "REST API for querying the DeployForge Windows application catalog."
    )
    api_prefix: str = "/api/v1"
    catalog_path: Path = PROJECT_ROOT / "packages" / "catalog.json"
    catalog_schema_path: Path = (
        PROJECT_ROOT / "catalog" / "schema" / "catalog.schema.json"
    )

    # Deployment interface (Day 5 Step 06). The API only registers operations;
    # the separate PowerShell agent executes them.
    allowed_origins: tuple[str, ...] = field(default_factory=_allowed_origins_from_env)
    operations_path: Path = PROJECT_ROOT / "backend" / "data" / "deployment-operations.json"
    audit_log_path: Path = PROJECT_ROOT / "logs" / "audit" / "deployforge-audit.jsonl"
    agent_token_path: Path = field(default_factory=_default_agent_token_path)
    confirmation_ttl_seconds: int = 120
    queued_ttl_seconds: int = 600
    agent_offline_after_seconds: int = 30
    operation_lost_after_seconds: int = 60
    operation_retention: int = 500


settings = Settings()

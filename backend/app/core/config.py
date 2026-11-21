"""Centralised, typed application settings."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# backend/app/core/config.py -> parents[3] is the repository root. Resolving from
# this file (not from the current working directory) keeps paths stable no
# matter where the process is started from.
PROJECT_ROOT = Path(__file__).resolve().parents[3]


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


settings = Settings()

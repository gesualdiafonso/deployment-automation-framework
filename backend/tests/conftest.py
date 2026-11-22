"""Shared test setup.

Every test runs with a DeploymentService whose registry, audit log and agent
token live in a temporary directory, so no test writes to the repository's
backend/data, logs/audit, or the real user profile.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.core.config import settings
from app.main import app
from app.services import deployment_service as deployment_module
from app.services.deployment_service import DeploymentService, get_deployment_service


def make_deployment_settings(tmp_path: Path, **overrides: object):
    return dataclasses.replace(
        settings,
        operations_path=tmp_path / "data" / "deployment-operations.json",
        audit_log_path=tmp_path / "audit" / "deployforge-audit.jsonl",
        agent_token_path=tmp_path / "profile" / "agent.token",
        **overrides,
    )


@pytest.fixture(autouse=True)
def isolated_deployment_service(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[DeploymentService]:
    service = DeploymentService(make_deployment_settings(tmp_path))
    service.agent_token.rotate()
    # Also replace the process-wide instance: some fixtures clear dependency_overrides,
    # and the app lifespan would otherwise create the real service (and token file).
    monkeypatch.setattr(deployment_module, "_service", service)
    app.dependency_overrides[get_deployment_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_deployment_service, None)

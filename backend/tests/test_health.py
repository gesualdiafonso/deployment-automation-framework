"""Tests for the health check endpoint and application metadata."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_returns_200(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200


def test_health_returns_exactly_the_expected_fields(client: TestClient) -> None:
    body = client.get("/health").json()

    assert set(body) == {"status", "service", "version"}


def test_health_status_is_ok(client: TestClient) -> None:
    body = client.get("/health").json()

    assert body["status"] == "ok"


def test_health_service_and_version_match_central_settings(
    client: TestClient,
) -> None:
    body = client.get("/health").json()

    assert body["service"] == settings.app_name
    assert body["version"] == settings.version


def test_openapi_schema_is_available(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == settings.app_name
    assert schema["info"]["version"] == settings.version
    assert "/health" in schema["paths"]

"""Tests for the 422 handler (``request_validation_error_handler``).

The real API only has a path parameter, so body and query cases run against a
throwaway app built in this module that registers the same handler. No
endpoint is added to the real application.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI, Query
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.exceptions import request_validation_error_handler
from app.main import app

INVALID_BODY = {"detail": "Invalid request body."}
LEAK_MARKERS = ("input", "ctx", "loc", "msg", "json_invalid", "JSON decode", "Expecting")


class _Item(BaseModel):
    name: str
    tags: list[str] = []


def _probe_app() -> FastAPI:
    probe = FastAPI()
    probe.add_exception_handler(RequestValidationError, request_validation_error_handler)

    @probe.get("/query")
    def read_query(limit: int = Query()) -> dict[str, int]:
        return {"limit": limit}

    @probe.post("/items")
    def create_item(item: _Item) -> dict[str, str]:
        return {"name": item.name}

    return probe


@pytest.fixture
def probe() -> TestClient:
    return TestClient(_probe_app())


def _assert_no_leak(body: dict[str, str], *values: str) -> None:
    assert set(body) == {"detail"}
    for marker in (*LEAK_MARKERS, *values):
        assert marker not in body["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(b'{"name":', id="truncated"),
        pytest.param(b'{"name": "secret-value",}', id="trailing-comma"),
        pytest.param(b"not json at all", id="plain-text"),
        pytest.param(b'{"name": "x"} trailing', id="extra-data"),
    ],
)
def test_malformed_json_returns_generic_body_message(
    probe: TestClient,
    payload: bytes,
) -> None:
    response = probe.post(
        "/items", content=payload, headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json() == INVALID_BODY
    _assert_no_leak(response.json(), "secret-value", "trailing", "not json")


def test_malformed_json_never_reports_a_parser_position(probe: TestClient) -> None:
    response = probe.post(
        "/items", content=b'{"name":', headers={"content-type": "application/json"}
    )

    assert not any(char.isdigit() for char in response.json()["detail"])


def test_missing_body_returns_generic_body_message(probe: TestClient) -> None:
    response = probe.post("/items")

    assert response.status_code == 422
    assert response.json() == INVALID_BODY


def test_invalid_body_field_names_the_field_only(probe: TestClient) -> None:
    response = probe.post("/items", json={"name": 12345})

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid request parameter: name."}
    _assert_no_leak(response.json(), "12345")


def test_invalid_list_item_names_the_list_not_the_index(probe: TestClient) -> None:
    response = probe.post("/items", json={"name": "x", "tags": ["ok", 7]})

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid request parameter: tags."}


def test_several_invalid_fields_are_listed_sorted_once(probe: TestClient) -> None:
    response = probe.post("/items", json={"tags": [1, 2]})

    assert response.json() == {"detail": "Invalid request parameter: name, tags."}


@pytest.mark.parametrize("url", ["/query", "/query?limit=abc"])
def test_invalid_query_parameter_keeps_named_message(
    probe: TestClient,
    url: str,
) -> None:
    response = probe.get(url)

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid request parameter: limit."}
    _assert_no_leak(response.json(), "abc")


def test_invalid_path_parameter_on_the_real_api_is_unchanged() -> None:
    response = TestClient(app).get("/api/v1/applications/Google.Chrome")

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid request parameter: application_id."}
    _assert_no_leak(response.json(), "Google.Chrome")

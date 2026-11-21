"""Integration tests for the application endpoints.

The real CatalogService is used throughout. Corruption scenarios point it at
copies in ``tmp_path`` through ``app.dependency_overrides``; the official
catalog is only ever read. Overrides are cleared after every test, so tests do
not depend on execution order.
"""

from __future__ import annotations

import copy
import json
import logging
import re
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes.applications import get_catalog_service
from app.core.catalog_validation import load_json
from app.core.config import PROJECT_ROOT, settings
from app.main import app
from app.schemas.application import (
    APPLICATION_ID_PATTERN,
    ApplicationListResponse,
    ApplicationResponse,
)
from app.services.catalog_service import CatalogService

BASE = f"{settings.api_prefix}/applications"
CATALOG_UNAVAILABLE = {"detail": "The application catalog is unavailable."}
INTERNAL_ERROR = {"detail": "Internal server error."}
INVALID_ID = {"detail": "Invalid request parameter: application_id."}

REAL_CATALOG = load_json(settings.catalog_path)
REAL_APPLICATIONS: list[dict[str, Any]] = REAL_CATALOG["applications"]
REAL_IDS = [application["id"] for application in REAL_APPLICATIONS]

APPLICATION_KEYS = {"id", "name", "version", "source", "deployment"}
SOURCE_KEYS = {"type", "package_id"}
DEPLOYMENT_KEYS = {"type", "entry_point"}

# Fragments that must never reach an HTTP client.
LEAK_MARKERS = (
    "Traceback",
    'File "',
    "catalog.json",
    "catalog.schema.json",
    "jsonschema",
    "is a required property",
    "duplicate application ID",
    "line ",
    "column ",
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides.clear()
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def use_catalog(tmp_path: Path) -> Callable[[Any], Path]:
    """Point the API at a temporary copy of the catalog with the given content.

    Pass a dict/list to write JSON, or a str to write raw text.
    """

    def _use(content: Any) -> Path:
        schema_copy = tmp_path / "catalog.schema.json"
        schema_copy.write_bytes(settings.catalog_schema_path.read_bytes())
        catalog_copy = tmp_path / "catalog.json"
        text = content if isinstance(content, str) else json.dumps(content)
        catalog_copy.write_text(text, encoding="utf-8")

        app.dependency_overrides[get_catalog_service] = lambda: CatalogService(
            catalog_path=catalog_copy, schema_path=schema_copy
        )
        return catalog_copy

    return _use


def assert_no_leak(body: str, *extra_markers: str) -> None:
    for marker in (*LEAK_MARKERS, *extra_markers):
        assert marker not in body, f"response leaked {marker!r}: {body}"


def real_catalog_copy() -> dict[str, Any]:
    return copy.deepcopy(REAL_CATALOG)


# --- 1-4: collection ---------------------------------------------------------


def test_list_returns_200(client: TestClient) -> None:
    response = client.get(BASE)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"


def test_list_contains_the_21_catalog_applications(client: TestClient) -> None:
    body = client.get(BASE).json()

    assert len(body["applications"]) == 21
    assert body["applications"] == REAL_APPLICATIONS


def test_list_total_matches_number_of_applications(client: TestClient) -> None:
    body = client.get(BASE).json()

    assert body["total"] == len(body["applications"]) == 21


def test_list_matches_list_response_contract(client: TestClient) -> None:
    body = client.get(BASE).json()

    ApplicationListResponse.model_validate(body)
    assert set(body) == {"applications", "total"}


def test_list_reflects_a_different_catalog(
    client: TestClient, use_catalog: Callable[[Any], Path]
) -> None:
    catalog = real_catalog_copy()
    catalog["applications"] = catalog["applications"][:3]
    use_catalog(catalog)

    body = client.get(BASE).json()

    assert body == {"applications": catalog["applications"], "total": 3}


# --- 5-6: single application -------------------------------------------------


@pytest.mark.parametrize("application", REAL_APPLICATIONS, ids=REAL_IDS)
def test_get_one_returns_the_catalog_record(
    client: TestClient, application: dict[str, Any]
) -> None:
    response = client.get(f"{BASE}/{application['id']}")

    assert response.status_code == 200
    assert response.json() == application
    ApplicationResponse.model_validate(response.json())


# --- 7-8: not found / ID vs package_id ---------------------------------------


@pytest.mark.parametrize(
    "application_id",
    ["id-inexistente", "application-inexistente", "google-chrome-x", "a", "0"],
)
def test_well_formed_unknown_id_returns_404(
    client: TestClient, application_id: str
) -> None:
    response = client.get(f"{BASE}/{application_id}")

    assert response.status_code == 404
    assert response.json() == {"detail": f"Application '{application_id}' not found."}


@pytest.mark.parametrize(
    "application",
    [a for a in REAL_APPLICATIONS if a["source"]["package_id"] != a["id"]],
    ids=lambda a: a["source"]["package_id"],
)
def test_package_id_is_not_an_application_id(
    client: TestClient, application: dict[str, Any]
) -> None:
    package_id = application["source"]["package_id"]
    # Package IDs use dots/uppercase, so they are rejected as malformed (422);
    # one that happened to be well-formed would still not be found (404).
    expected = 404 if re.fullmatch(APPLICATION_ID_PATTERN, package_id) else 422

    by_package = client.get(f"{BASE}/{package_id}")
    by_id = client.get(f"{BASE}/{application['id']}")

    assert by_package.status_code == expected
    assert by_id.status_code == 200
    assert by_id.json()["source"]["package_id"] == package_id


# --- application_id format (EPIC 09 / TASK 09.2) ------------------------------


class _ServiceMustNotBeCalled:
    """Fails the test if a request reaches the catalog service."""

    def get_applications(self) -> list[dict[str, Any]]:
        raise AssertionError("catalog service called for an invalid request")

    def get_application_by_id(self, application_id: str) -> dict[str, Any] | None:
        raise AssertionError(f"catalog service called with {application_id!r}")


@pytest.mark.parametrize(
    "raw",
    [
        pytest.param("Google.Chrome", id="package-id-style"),
        pytest.param("GOOGLE-CHROME", id="uppercase"),
        pytest.param("Google-chrome", id="leading-uppercase"),
        pytest.param("google_chrome", id="underscore"),
        pytest.param("google.chrome", id="dot"),
        pytest.param("google..chrome", id="double-dot"),
        pytest.param("-x", id="leading-hyphen"),
        pytest.param("google-", id="trailing-hyphen"),
        pytest.param("-", id="only-hyphen"),
        pytest.param("a--b", id="double-hyphen"),
        pytest.param("google%20chrome", id="inner-space"),
        pytest.param("%20google-chrome", id="leading-space"),
        pytest.param("google-chrome%0A", id="trailing-newline"),
        pytest.param("google-chrome%09", id="trailing-tab"),
        pytest.param("googl%C3%A9", id="non-ascii"),
        pytest.param("google-chrome%3B", id="semicolon"),
    ],
)
def test_malformed_id_returns_422_before_reaching_the_service(
    client: TestClient, raw: str
) -> None:
    app.dependency_overrides[get_catalog_service] = _ServiceMustNotBeCalled

    response = client.get(f"{BASE}/{raw}", follow_redirects=False)

    assert response.status_code == 422
    assert response.json() == INVALID_ID
    assert_no_leak(response.text, APPLICATION_ID_PATTERN, "pattern", "input", "ctx")


@pytest.mark.parametrize(
    "application_id",
    ["a", "0", "7zip", "a-b", "a1-b2-c3", "abc-123-xyz", "x" * 200],
    ids=["single-letter", "single-digit", "digit-first", "one-hyphen",
         "alnum-segments", "mixed", "long"],
)
def test_well_formed_ids_pass_validation(
    client: TestClient, application_id: str
) -> None:
    response = client.get(f"{BASE}/{application_id}")

    expected = 200 if application_id in REAL_IDS else 404
    assert response.status_code == expected


def test_empty_id_does_not_reach_the_endpoint(client: TestClient) -> None:
    app.dependency_overrides[get_catalog_service] = _ServiceMustNotBeCalled

    response = client.get(f"{BASE}/", follow_redirects=False)

    # FastAPI's slash redirect sends it to the collection; the ID handler never runs.
    assert response.status_code == 307
    assert response.headers["location"].endswith(BASE)


def test_id_pattern_matches_official_json_schema() -> None:
    official = load_json(settings.catalog_schema_path)

    assert (
        official["$defs"]["application"]["properties"]["id"]["pattern"]
        == APPLICATION_ID_PATTERN
    )


def test_every_real_id_is_well_formed() -> None:
    assert all(re.fullmatch(APPLICATION_ID_PATTERN, i) for i in REAL_IDS)


@pytest.mark.parametrize("path", ["/health", BASE])
def test_query_strings_do_not_trigger_422_elsewhere(
    client: TestClient, path: str
) -> None:
    assert client.get(f"{path}?id=Google.Chrome&x=1").status_code == 200


# --- 9: no unexpected fields --------------------------------------------------


def test_responses_contain_only_contract_fields(client: TestClient) -> None:
    collection = client.get(BASE).json()
    single = client.get(f"{BASE}/google-chrome").json()

    assert set(collection) == {"applications", "total"}
    for application in [*collection["applications"], single]:
        assert set(application) == APPLICATION_KEYS
        assert set(application["source"]) == SOURCE_KEYS
        assert set(application["deployment"]) == DEPLOYMENT_KEYS


# --- 10: invalid catalog -> 500 without details -------------------------------


def _not_matching_schema() -> dict[str, Any]:
    catalog = real_catalog_copy()
    del catalog["applications"][0]["name"]
    return catalog


def _duplicate_ids() -> dict[str, Any]:
    catalog = real_catalog_copy()
    catalog["applications"].append(copy.deepcopy(catalog["applications"][0]))
    return catalog


def _extra_property() -> dict[str, Any]:
    catalog = real_catalog_copy()
    catalog["applications"][0]["internal_notes"] = "secret"
    return catalog


@pytest.mark.parametrize(
    "build",
    [_not_matching_schema, _duplicate_ids, _extra_property],
    ids=["schema-violation", "duplicate-ids", "extra-property"],
)
@pytest.mark.parametrize("path", [BASE, f"{BASE}/google-chrome"])
def test_invalid_catalog_returns_generic_500(
    client: TestClient,
    use_catalog: Callable[[Any], Path],
    caplog: pytest.LogCaptureFixture,
    build: Callable[[], dict[str, Any]],
    path: str,
) -> None:
    catalog_copy = use_catalog(build())

    with caplog.at_level(logging.ERROR, logger="app.core.exceptions"):
        response = client.get(path)

    assert response.status_code == 500
    assert response.json() == CATALOG_UNAVAILABLE
    assert_no_leak(response.text, str(catalog_copy.parent), "secret")
    # The technical cause is kept server-side.
    assert any("failed validation" in r.getMessage() for r in caplog.records)


# --- 11: read errors -> 500 without local paths -------------------------------


@pytest.mark.parametrize(
    "content",
    ['{"schema_version": "1.0", "applications": [', "", "\x00not json"],
    ids=["truncated", "empty", "garbage"],
)
def test_malformed_catalog_returns_generic_500(
    client: TestClient,
    use_catalog: Callable[[Any], Path],
    caplog: pytest.LogCaptureFixture,
    content: str,
) -> None:
    catalog_copy = use_catalog(content)

    with caplog.at_level(logging.ERROR, logger="app.core.exceptions"):
        response = client.get(BASE)

    assert response.status_code == 500
    assert response.json() == CATALOG_UNAVAILABLE
    assert_no_leak(response.text, str(catalog_copy.parent), str(PROJECT_ROOT))
    assert any("Malformed JSON" in r.getMessage() for r in caplog.records)


def test_missing_catalog_returns_500_without_paths(
    client: TestClient,
    use_catalog: Callable[[Any], Path],
    caplog: pytest.LogCaptureFixture,
) -> None:
    catalog_copy = use_catalog(REAL_CATALOG)
    catalog_copy.unlink()

    with caplog.at_level(logging.ERROR, logger="app.core.exceptions"):
        response = client.get(f"{BASE}/google-chrome")

    assert response.status_code == 500
    assert response.json() == CATALOG_UNAVAILABLE
    assert_no_leak(response.text, str(catalog_copy.parent), str(PROJECT_ROOT))
    assert any(str(catalog_copy) in r.getMessage() for r in caplog.records)


def test_missing_schema_returns_500_without_paths(
    client: TestClient, tmp_path: Path
) -> None:
    missing_schema = tmp_path / "nowhere" / "catalog.schema.json"
    app.dependency_overrides[get_catalog_service] = lambda: CatalogService(
        catalog_path=settings.catalog_path, schema_path=missing_schema
    )

    response = client.get(BASE)

    assert response.status_code == 500
    assert response.json() == CATALOG_UNAVAILABLE
    assert_no_leak(response.text, str(tmp_path), str(PROJECT_ROOT))


# --- 12: response_model integration (strict, extra="forbid") ------------------


class _FakeService:
    """Stands in for CatalogService and returns out-of-contract data."""

    def __init__(self, applications: list[dict[str, Any]]) -> None:
        self._applications = applications

    def get_applications(self) -> list[dict[str, Any]]:
        return self._applications

    def get_application_by_id(self, application_id: str) -> dict[str, Any] | None:
        return next(
            (a for a in self._applications if a["id"] == application_id), None
        )


def _app_with(**changes: Any) -> dict[str, Any]:
    application = copy.deepcopy(REAL_APPLICATIONS[0])
    application.update(changes)
    return application


@pytest.mark.parametrize(
    "application",
    [
        _app_with(internal_notes="secret-value"),       # extra="forbid"
        _app_with(name=b"secret-value"),                # strict: bytes != str
        _app_with(version=None),                        # not nullable
        _app_with(name=""),                             # min_length
    ],
    ids=["extra-field", "strict-bytes", "none", "empty-name"],
)
@pytest.mark.parametrize("single", [False, True], ids=["list", "single"])
def test_out_of_contract_data_is_blocked_by_response_model(
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
    application: dict[str, Any],
    single: bool,
) -> None:
    app.dependency_overrides[get_catalog_service] = lambda: _FakeService([application])
    path = f"{BASE}/{application['id']}" if single else BASE

    with caplog.at_level(logging.ERROR, logger="app.core.exceptions"):
        response = client.get(path)

    assert response.status_code == 500
    assert response.json() == INTERNAL_ERROR
    assert_no_leak(response.text, "secret-value", "internal_notes")
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "Response validation failed" in logged
    assert "secret-value" not in logged  # values are not logged, only locations


def test_strict_contract_accepts_real_catalog_data(client: TestClient) -> None:
    app.dependency_overrides[get_catalog_service] = lambda: _FakeService(
        copy.deepcopy(REAL_APPLICATIONS)
    )

    response = client.get(BASE)

    assert response.status_code == 200
    assert response.json()["total"] == 21


# --- 13: unexpected exceptions -> generic JSON 500 ----------------------------


class _BrokenService:
    """Stands in for CatalogService and fails with an unexpected exception."""

    def get_applications(self) -> list[dict[str, Any]]:
        raise RuntimeError("secret-value at C:/internal/path")

    def get_application_by_id(self, application_id: str) -> dict[str, Any] | None:
        raise RuntimeError("secret-value at C:/internal/path")


@pytest.mark.parametrize("path", [BASE, f"{BASE}/google-chrome"])
def test_unexpected_exception_returns_contract_500(
    caplog: pytest.LogCaptureFixture,
    path: str,
) -> None:
    # Starlette re-raises after responding so the server can log the traceback;
    # the client must still receive the documented JSON body.
    app.dependency_overrides[get_catalog_service] = lambda: _BrokenService()
    try:
        with caplog.at_level(logging.ERROR, logger="app.core.exceptions"):
            response = TestClient(app, raise_server_exceptions=False).get(path)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/json"
    assert response.json() == INTERNAL_ERROR
    assert_no_leak(response.text, "secret-value", "RuntimeError", "C:/internal")
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "Unhandled RuntimeError" in logged
    assert "secret-value" not in logged


# --- Isolation and documentation ---------------------------------------------


def test_overrides_are_cleared_between_tests(client: TestClient) -> None:
    assert app.dependency_overrides == {}
    assert client.get(BASE).json()["total"] == len(REAL_APPLICATIONS)


def test_openapi_documents_application_endpoints(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    collection = paths[BASE]["get"]["responses"]
    single = paths[f"{BASE}/{{application_id}}"]["get"]["responses"]

    assert set(collection) == {"200", "500"}
    assert set(single) == {"200", "404", "422", "500"}
    assert collection["200"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/ApplicationListResponse"
    )
    assert single["200"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/ApplicationResponse"
    )


def test_openapi_documents_422_and_the_id_pattern(client: TestClient) -> None:
    operation = client.get("/openapi.json").json()["paths"][
        f"{BASE}/{{application_id}}"
    ]["get"]

    (parameter,) = operation["parameters"]
    assert parameter["name"] == "application_id"
    assert parameter["in"] == "path"
    assert parameter["schema"]["pattern"] == APPLICATION_ID_PATTERN

    unprocessable = operation["responses"]["422"]
    schema = unprocessable["content"]["application/json"]["schema"]
    # Same {"detail": string} shape as 404/500, not FastAPI's HTTPValidationError.
    assert schema == {
        "type": "object",
        "properties": {"detail": {"type": "string"}},
        "required": ["detail"],
    }
    assert APPLICATION_ID_PATTERN in unprocessable["description"]

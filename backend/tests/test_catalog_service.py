"""Unit tests for CatalogService.

Every test works on copies in ``tmp_path``; the real catalog is only read.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.core.config import settings
from app.core.exceptions import CatalogError
from app.services.catalog_service import CatalogService

REAL_SCHEMA = json.loads(
    settings.catalog_schema_path.read_text(encoding="utf-8-sig")
)


def make_application(application_id: str, package_id: str) -> dict[str, Any]:
    return {
        "id": application_id,
        "name": application_id.replace("-", " ").title(),
        "version": "latest",
        "source": {"type": "winget", "package_id": package_id},
        "deployment": {
            "type": "powershell",
            "entry_point": f"packages/test/{application_id}/Deploy-Application.ps1",
        },
    }


VALID_CATALOG: dict[str, Any] = {
    "schema_version": "1.0",
    "applications": [
        make_application("google-chrome", "Google.Chrome"),
        make_application("7zip", "7zip.7zip"),
    ],
}


def write_json(path: Path, data: Any, encoding: str = "utf-8") -> Path:
    path.write_text(json.dumps(data, indent=2), encoding=encoding)
    return path


@pytest.fixture
def schema_path(tmp_path: Path) -> Path:
    return write_json(tmp_path / "catalog.schema.json", REAL_SCHEMA)


@pytest.fixture
def catalog_data() -> dict[str, Any]:
    return copy.deepcopy(VALID_CATALOG)


@pytest.fixture
def catalog_path(tmp_path: Path, catalog_data: dict[str, Any]) -> Path:
    return write_json(tmp_path / "catalog.json", catalog_data)


@pytest.fixture
def service(catalog_path: Path, schema_path: Path) -> CatalogService:
    return CatalogService(catalog_path=catalog_path, schema_path=schema_path)


def assert_catalog_error(service: CatalogService, *fragments: str) -> CatalogError:
    with pytest.raises(CatalogError) as exc_info:
        service.get_catalog()

    error = exc_info.value
    assert error.message == "The application catalog is unavailable."
    assert error.detail is not None
    for fragment in fragments:
        assert fragment in error.detail
    return error


# 1
def test_reads_valid_catalog(service: CatalogService) -> None:
    assert service.get_catalog() == VALID_CATALOG


# 2
def test_reads_catalog_with_utf8_bom(
    tmp_path: Path, schema_path: Path, catalog_data: dict[str, Any]
) -> None:
    bom_catalog = write_json(tmp_path / "bom.json", catalog_data, "utf-8-sig")
    assert bom_catalog.read_bytes().startswith(b"\xef\xbb\xbf")

    service = CatalogService(catalog_path=bom_catalog, schema_path=schema_path)

    assert service.get_catalog() == VALID_CATALOG


# 3
def test_missing_catalog_raises(tmp_path: Path, schema_path: Path) -> None:
    service = CatalogService(
        catalog_path=tmp_path / "missing.json", schema_path=schema_path
    )

    assert_catalog_error(service, "Catalog file not found", "missing.json")


# 4
def test_missing_schema_raises(tmp_path: Path, catalog_path: Path) -> None:
    service = CatalogService(
        catalog_path=catalog_path, schema_path=tmp_path / "missing.schema.json"
    )

    assert_catalog_error(service, "Schema file not found", "missing.schema.json")


# 5
def test_malformed_json_raises(tmp_path: Path, schema_path: Path) -> None:
    broken = tmp_path / "broken.json"
    broken.write_text('{"schema_version": "1.0", "applications": [', "utf-8")
    service = CatalogService(catalog_path=broken, schema_path=schema_path)

    assert_catalog_error(service, "Malformed JSON in catalog", "line 1")


# 5b
@pytest.mark.parametrize("target", ["catalog", "schema"])
def test_deeply_nested_json_raises_catalog_error(
    tmp_path: Path, catalog_path: Path, schema_path: Path, target: str
) -> None:
    nested = tmp_path / "nested.json"
    nested.write_text("[" * 200_000, encoding="utf-8")
    paths = {"catalog_path": catalog_path, "schema_path": schema_path}
    paths[f"{target}_path"] = nested
    service = CatalogService(**paths)

    assert_catalog_error(service, f"Could not read {target}", "nested.json")


# 6
def test_invalid_schema_raises(tmp_path: Path, catalog_path: Path) -> None:
    bad_schema = write_json(tmp_path / "bad.schema.json", {"type": 123})
    service = CatalogService(catalog_path=catalog_path, schema_path=bad_schema)

    assert_catalog_error(service, "Invalid JSON Schema")


# 7
@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (lambda app: app.pop("name"), "'name' is a required property"),
        (lambda app: app.update(id="Google_Chrome"), "$.applications[0].id"),
        (lambda app: app["source"].update(type="ftp"), "'ftp' is not one of"),
        (lambda app: app.update(version="1.0 --force"), "$.applications[0].version"),
    ],
    ids=["missing-required", "bad-id-pattern", "bad-enum", "unsafe-version"],
)
def test_catalog_not_matching_schema_raises(
    tmp_path: Path,
    schema_path: Path,
    catalog_data: dict[str, Any],
    mutate: Any,
    fragment: str,
) -> None:
    mutate(catalog_data["applications"][0])
    path = write_json(tmp_path / "catalog.json", catalog_data)
    service = CatalogService(catalog_path=path, schema_path=schema_path)

    assert_catalog_error(service, "failed validation", fragment)


# 8
def test_duplicate_application_ids_raise(
    tmp_path: Path, schema_path: Path, catalog_data: dict[str, Any]
) -> None:
    # Same application.id, different source.package_id: still a duplicate.
    catalog_data["applications"].append(
        make_application("google-chrome", "Google.Chrome.Beta")
    )
    path = write_json(tmp_path / "catalog.json", catalog_data)
    service = CatalogService(catalog_path=path, schema_path=schema_path)

    assert_catalog_error(service, "duplicate application ID 'google-chrome'")

    with pytest.raises(CatalogError):
        service.get_applications()


def test_shared_package_id_with_distinct_ids_is_valid(
    tmp_path: Path, schema_path: Path, catalog_data: dict[str, Any]
) -> None:
    catalog_data["applications"].append(
        make_application("chrome-kiosk", "Google.Chrome")
    )
    path = write_json(tmp_path / "catalog.json", catalog_data)
    service = CatalogService(catalog_path=path, schema_path=schema_path)

    assert len(service.get_applications()) == 3


# 9
@pytest.mark.parametrize(
    "data",
    [
        [],
        {"schema_version": "1.0"},
        {"schema_version": "1.0", "applications": {}},
        {"schema_version": "1.0", "applications": []},
        {"schema_version": "2.0", "applications": VALID_CATALOG["applications"]},
    ],
    ids=["root-is-array", "no-applications", "applications-not-array",
         "empty-applications", "wrong-schema-version"],
)
def test_catalog_with_invalid_structure_raises(
    tmp_path: Path, schema_path: Path, data: Any
) -> None:
    path = write_json(tmp_path / "catalog.json", data)
    service = CatalogService(catalog_path=path, schema_path=schema_path)

    assert_catalog_error(service, "failed validation")


# 10
@pytest.mark.parametrize(
    ("location", "fragment"),
    [
        ("root", "$:"),
        ("application", "$.applications[0]:"),
        ("source", "$.applications[0].source:"),
        ("deployment", "$.applications[0].deployment:"),
    ],
)
def test_additional_properties_are_rejected(
    tmp_path: Path,
    schema_path: Path,
    catalog_data: dict[str, Any],
    location: str,
    fragment: str,
) -> None:
    application = catalog_data["applications"][0]
    target = {
        "root": catalog_data,
        "application": application,
        "source": application.get("source"),
        "deployment": application.get("deployment"),
    }[location]
    target["unexpected"] = "value"
    path = write_json(tmp_path / "catalog.json", catalog_data)
    service = CatalogService(catalog_path=path, schema_path=schema_path)

    error = assert_catalog_error(service, fragment)
    assert "Additional properties are not allowed" in (error.detail or "")


# 11
def test_get_applications_returns_list(service: CatalogService) -> None:
    applications = service.get_applications()

    assert applications == VALID_CATALOG["applications"]
    assert [app["id"] for app in applications] == ["google-chrome", "7zip"]


# 12
def test_get_application_by_id_finds_existing(service: CatalogService) -> None:
    application = service.get_application_by_id("7zip")

    assert application == make_application("7zip", "7zip.7zip")


# 13
@pytest.mark.parametrize("application_id", ["missing-app", "Google.Chrome", ""])
def test_get_application_by_id_returns_none_when_absent(
    service: CatalogService, application_id: str
) -> None:
    # "Google.Chrome" is a source.package_id, not an application.id.
    assert service.get_application_by_id(application_id) is None


# 14
def test_catalog_changes_are_visible_on_next_call(
    service: CatalogService, catalog_path: Path, catalog_data: dict[str, Any]
) -> None:
    assert service.get_application_by_id("figma") is None

    catalog_data["applications"].append(make_application("figma", "Figma.Figma"))
    write_json(catalog_path, catalog_data)

    assert service.get_application_by_id("figma") is not None
    assert len(service.get_applications()) == 3


def test_default_paths_resolve_to_real_project_files() -> None:
    assert settings.catalog_path.is_file()
    assert settings.catalog_schema_path.is_file()
    assert settings.catalog_path.is_absolute()

    applications = CatalogService().get_applications()

    assert applications
    assert len({app["id"] for app in applications}) == len(applications)

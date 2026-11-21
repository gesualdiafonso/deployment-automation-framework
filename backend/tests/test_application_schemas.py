"""Tests for the application response schemas."""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from app.core.catalog_validation import load_json
from app.core.config import settings
from app.schemas.application import (
    ApplicationDeployment,
    ApplicationListResponse,
    ApplicationResponse,
    ApplicationSource,
)

CATALOG = load_json(settings.catalog_path)
REAL_APPLICATIONS: list[dict[str, Any]] = CATALOG["applications"]
OFFICIAL_SCHEMA = load_json(settings.catalog_schema_path)

APPLICATION_NODE = OFFICIAL_SCHEMA["$defs"]["application"]
SOURCE_NODE = APPLICATION_NODE["properties"]["source"]
DEPLOYMENT_NODE = APPLICATION_NODE["properties"]["deployment"]

# Pydantic model <-> node of the official JSON Schema it must mirror.
MODEL_SCHEMA_PAIRS: list[tuple[type[BaseModel], dict[str, Any]]] = [
    (ApplicationResponse, APPLICATION_NODE),
    (ApplicationSource, SOURCE_NODE),
    (ApplicationDeployment, DEPLOYMENT_NODE),
]
CONSTRAINT_KEYS = ("type", "enum", "pattern", "minLength")


def sample() -> dict[str, Any]:
    return copy.deepcopy(REAL_APPLICATIONS[0])


def model_property_schemas(model: type[BaseModel]) -> tuple[dict[str, Any], dict]:
    generated = model.model_json_schema()
    return generated, generated["properties"]


# --- Real catalog -----------------------------------------------------------


def test_real_catalog_has_21_applications() -> None:
    assert len(REAL_APPLICATIONS) == 21


@pytest.mark.parametrize(
    "application", REAL_APPLICATIONS, ids=[a["id"] for a in REAL_APPLICATIONS]
)
def test_every_real_application_round_trips(application: dict[str, Any]) -> None:
    model = ApplicationResponse.model_validate(application)

    assert model.model_dump() == application


def test_real_catalog_builds_list_response() -> None:
    response = ApplicationListResponse(
        applications=[ApplicationResponse.model_validate(a) for a in REAL_APPLICATIONS],
        total=len(REAL_APPLICATIONS),
    )

    assert response.total == 21
    assert response.model_dump() == {
        "applications": REAL_APPLICATIONS,
        "total": 21,
    }


def test_list_response_serialises_to_json() -> None:
    response = ApplicationListResponse.model_validate(
        {"applications": REAL_APPLICATIONS, "total": len(REAL_APPLICATIONS)}
    )

    decoded = json.loads(response.model_dump_json())

    assert decoded == {"applications": REAL_APPLICATIONS, "total": 21}
    assert list(decoded) == ["applications", "total"]


def test_application_serialises_to_json() -> None:
    application = sample()

    decoded = json.loads(ApplicationResponse.model_validate(application).model_dump_json())

    assert decoded == application


def test_list_response_accepts_empty_collection() -> None:
    response = ApplicationListResponse(applications=[], total=0)

    assert response.model_dump() == {"applications": [], "total": 0}


# --- Rejections -------------------------------------------------------------


@pytest.mark.parametrize("level", ["application", "source", "deployment"])
def test_unexpected_field_is_rejected_at_every_level(level: str) -> None:
    data = sample()
    target = data if level == "application" else data[level]
    target["unexpected"] = "value"

    with pytest.raises(ValidationError) as exc_info:
        ApplicationResponse.model_validate(data)

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"


def test_unexpected_field_is_rejected_in_list_response() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ApplicationListResponse.model_validate(
            {"applications": [], "total": 0, "schema_version": "1.0"}
        )

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"


@pytest.mark.parametrize(
    "path",
    [
        ("id",), ("name",), ("version",), ("source",), ("deployment",),
        ("source", "type"), ("source", "package_id"),
        ("deployment", "type"), ("deployment", "entry_point"),
    ],
    ids=lambda p: ".".join(p),
)
def test_missing_required_field_is_rejected(path: tuple[str, ...]) -> None:
    data = sample()
    parent = data
    for key in path[:-1]:
        parent = parent[key]
    del parent[path[-1]]

    with pytest.raises(ValidationError) as exc_info:
        ApplicationResponse.model_validate(data)

    error = exc_info.value.errors()[0]
    assert error["type"] == "missing"
    assert error["loc"] == path


@pytest.mark.parametrize("field", ["applications", "total"])
def test_list_response_requires_both_fields(field: str) -> None:
    data: dict[str, Any] = {"applications": [], "total": 0}
    del data[field]

    with pytest.raises(ValidationError):
        ApplicationListResponse.model_validate(data)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("id",), None), (("id",), 123),
        (("name",), None), (("name",), ["Chrome"]),
        (("version",), None), (("version",), 1.0),
        (("source",), None), (("source",), "winget"),
        (("deployment",), None),
        (("source", "package_id"), None), (("source", "package_id"), 42),
        (("source", "type"), None),
        (("deployment", "entry_point"), None),
        (("deployment", "type"), None),
    ],
    ids=lambda v: ".".join(v) if isinstance(v, tuple) else repr(v),
)
def test_wrong_type_or_none_is_rejected(path: tuple[str, ...], value: Any) -> None:
    data = sample()
    parent = data
    for key in path[:-1]:
        parent = parent[key]
    parent[path[-1]] = value

    with pytest.raises(ValidationError):
        ApplicationResponse.model_validate(data)


@pytest.mark.parametrize("total", [None, "21", 21.0, True])
def test_total_must_be_a_strict_integer(total: Any) -> None:
    with pytest.raises(ValidationError):
        ApplicationListResponse.model_validate({"applications": [], "total": total})


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("source", "type"), "ftp"),
        (("source", "type"), "Winget"),
        (("deployment", "type"), "msi"),
    ],
)
def test_invalid_enum_value_is_rejected(path: tuple[str, str], value: str) -> None:
    data = sample()
    data[path[0]][path[1]] = value

    with pytest.raises(ValidationError) as exc_info:
        ApplicationResponse.model_validate(data)

    assert exc_info.value.errors()[0]["type"] == "literal_error"


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("id",), "Google-Chrome"),
        (("id",), "google_chrome"),
        (("id",), "-chrome"),
        (("id",), "chrome-"),
        (("id",), ""),
        (("version",), "1.0 --force"),
        (("version",), ".1"),
        (("version",), ""),
        (("source", "package_id"), "Vendor.App; calc"),
        (("source", "package_id"), "../etc"),
        (("source", "package_id"), ""),
    ],
)
def test_invalid_pattern_is_rejected(path: tuple[str, ...], value: str) -> None:
    data = sample()
    parent = data
    for key in path[:-1]:
        parent = parent[key]
    parent[path[-1]] = value

    with pytest.raises(ValidationError) as exc_info:
        ApplicationResponse.model_validate(data)

    assert exc_info.value.errors()[0]["type"] == "string_pattern_mismatch"


@pytest.mark.parametrize("path", [("name",), ("deployment", "entry_point")])
def test_empty_string_is_rejected_where_min_length_applies(
    path: tuple[str, ...],
) -> None:
    data = sample()
    parent = data
    for key in path[:-1]:
        parent = parent[key]
    parent[path[-1]] = ""

    with pytest.raises(ValidationError) as exc_info:
        ApplicationResponse.model_validate(data)

    assert exc_info.value.errors()[0]["type"] == "string_too_short"


@pytest.mark.parametrize("total", [0, 20, 22, -1])
def test_total_must_match_number_of_applications(total: int) -> None:
    with pytest.raises(ValidationError):
        ApplicationListResponse.model_validate(
            {"applications": REAL_APPLICATIONS, "total": total}
        )


# --- Sync with the official JSON Schema -------------------------------------


@pytest.mark.parametrize(
    ("model", "node"), MODEL_SCHEMA_PAIRS, ids=lambda v: getattr(v, "__name__", "")
)
def test_model_properties_match_official_schema(
    model: type[BaseModel], node: dict[str, Any]
) -> None:
    generated, properties = model_property_schemas(model)

    assert set(properties) == set(node["properties"])
    assert generated["additionalProperties"] is False
    assert node["additionalProperties"] is False


@pytest.mark.parametrize(
    ("model", "node"), MODEL_SCHEMA_PAIRS, ids=lambda v: getattr(v, "__name__", "")
)
def test_model_required_fields_match_official_schema(
    model: type[BaseModel], node: dict[str, Any]
) -> None:
    generated, properties = model_property_schemas(model)

    assert set(generated["required"]) == set(node["required"])
    # Everything is required: no optional fields anywhere.
    assert set(generated["required"]) == set(properties)


@pytest.mark.parametrize(
    ("model", "node"), MODEL_SCHEMA_PAIRS, ids=lambda v: getattr(v, "__name__", "")
)
def test_model_constraints_match_official_schema(
    model: type[BaseModel], node: dict[str, Any]
) -> None:
    _, properties = model_property_schemas(model)

    for name, official in node["properties"].items():
        mine = properties[name]

        if official["type"] == "object":
            assert "$ref" in mine, f"{model.__name__}.{name} should be a nested model"
            continue

        for key in CONSTRAINT_KEYS:
            assert mine.get(key) == official.get(key), (
                f"{model.__name__}.{name}: {key} differs "
                f"(pydantic={mine.get(key)!r}, official={official.get(key)!r})"
            )


@pytest.mark.parametrize(
    "model",
    [ApplicationResponse, ApplicationSource, ApplicationDeployment,
     ApplicationListResponse],
    ids=lambda m: m.__name__,
)
def test_no_optional_or_nullable_fields(model: type[BaseModel]) -> None:
    _, properties = model_property_schemas(model)

    for name, field in model.model_fields.items():
        assert field.is_required(), f"{model.__name__}.{name} is optional"
    for name, prop in properties.items():
        assert "anyOf" not in prop and "default" not in prop, (
            f"{model.__name__}.{name} is nullable or has a default"
        )
        assert prop.get("type") != "null"


def test_nested_models_map_to_official_nested_objects() -> None:
    _, properties = model_property_schemas(ApplicationResponse)

    assert properties["source"]["$ref"].endswith("/ApplicationSource")
    assert properties["deployment"]["$ref"].endswith("/ApplicationDeployment")

"""Tests for the DeployForge catalog validator."""

import json
from pathlib import Path

from tools.validate_catalog import validate_catalog_data


ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "packages" / "catalog.json"
SCHEMA_PATH = ROOT / "catalog" / "schema" / "catalog.schema.json"


def load_catalog_and_schema():
    with CATALOG_PATH.open(encoding="utf-8-sig") as file:
        catalog = json.load(file)

    with SCHEMA_PATH.open(encoding="utf-8-sig") as file:
        schema = json.load(file)

    return catalog, schema


def test_catalog_is_valid():
    catalog, schema = load_catalog_and_schema()

    assert validate_catalog_data(catalog, schema) == []


def test_missing_required_application_field_is_rejected():
    catalog, schema = load_catalog_and_schema()
    del catalog["applications"][0]["name"]

    errors = validate_catalog_data(catalog, schema)

    assert errors
    assert any("name" in error for error in errors)


def test_duplicate_application_ids_are_rejected():
    catalog, schema = load_catalog_and_schema()
    duplicate = catalog["applications"][0].copy()
    catalog["applications"].append(duplicate)

    errors = validate_catalog_data(catalog, schema)

    assert any("duplicate application ID" in error for error in errors)
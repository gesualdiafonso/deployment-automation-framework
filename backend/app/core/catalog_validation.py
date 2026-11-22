"""Single implementation of the DeployForge catalog validation rules.

Shared by the API (``app.services.catalog_service``) and the CLI validator
(``tools/validate_catalog.py``). Only depends on the standard library and
``jsonschema``, so importing it never pulls in FastAPI.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

__all__ = [
    "SchemaError",
    "check_schema",
    "load_json",
    "validate_catalog_data",
]


def load_json(path: Path) -> Any:
    """Load JSON, accepting UTF-8 files with or without a BOM."""
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def check_schema(schema: Any) -> None:
    """Ensure the schema itself is valid Draft 2020-12.

    Raises ``SchemaError`` when it is not.
    """
    Draft202012Validator.check_schema(schema)


def validate_catalog_data(
    catalog: Any,
    schema: dict[str, Any],
) -> list[str]:
    """Validate catalog structure and ensure application IDs are unique."""
    errors = [
        f"{error.json_path}: {error.message}"
        for error in Draft202012Validator(schema).iter_errors(catalog)
    ]

    if not isinstance(catalog, dict):
        return sorted(errors)

    applications = catalog.get("applications")

    if not isinstance(applications, list):
        return sorted(errors)

    seen_ids: set[str] = set()

    for index, application in enumerate(applications):
        if not isinstance(application, dict):
            continue

        application_id = application.get("id")

        if not isinstance(application_id, str):
            continue

        if application_id in seen_ids:
            errors.append(
                f"$.applications[{index}].id: "
                f"duplicate application ID '{application_id}'"
            )
        else:
            seen_ids.add(application_id)

    return sorted(errors)

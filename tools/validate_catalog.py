"""Validate the DeployForge application catalog."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = ROOT / "packages" / "catalog.json"
DEFAULT_SCHEMA = ROOT / "catalog" / "schema" / "catalog.schema.json"


def load_json(path: Path) -> Any:
    """Load JSON, accepting UTF-8 files with or without a BOM."""
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


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


def main() -> int:
    """Validate the default catalog and return an exit code."""
    try:
        catalog = load_json(DEFAULT_CATALOG)
        schema = load_json(DEFAULT_SCHEMA)
    except FileNotFoundError as exc:
        print(f"ERROR: File not found: {exc.filename}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(
            f"ERROR: Invalid JSON at line {exc.lineno}, "
            f"column {exc.colno}: {exc.msg}",
            file=sys.stderr,
        )
        return 2
    except OSError as exc:
        print(f"ERROR: Could not read file: {exc}", file=sys.stderr)
        return 2

    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        print(f"ERROR: Invalid JSON Schema: {exc.message}", file=sys.stderr)
        return 2

    errors = validate_catalog_data(catalog, schema)

    if errors:
        print("Catalog validation failed:")
        for error in errors:
            print(f"  - {error}")
        return 1

    print(
        f"Catalog validation passed: "
        f"{len(catalog['applications'])} application(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
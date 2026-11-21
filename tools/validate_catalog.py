"""Validate the DeployForge application catalog."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_BACKEND_DIR = ROOT / "backend"

# Explicit bootstrap: the validation rules live in the backend package
# (app.core.catalog_validation) so the API and this CLI share one
# implementation. The path is derived from this file's location, never from the
# current working directory, so the CLI runs the same from any folder.
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.core.catalog_validation import (  # noqa: E402
    SchemaError,
    check_schema,
    load_json,
    validate_catalog_data,
)
from app.core.config import settings  # noqa: E402

__all__ = ["load_json", "main", "validate_catalog_data"]

DEFAULT_CATALOG = settings.catalog_path
DEFAULT_SCHEMA = settings.catalog_schema_path


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
    except (UnicodeDecodeError, RecursionError) as exc:
        # Not UTF-8, or JSON nested too deeply to parse: unreadable, not invalid.
        print(f"ERROR: Could not parse file: {exc}", file=sys.stderr)
        return 2

    try:
        check_schema(schema)
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

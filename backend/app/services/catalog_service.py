"""Read-only access to the validated application catalog.

Loading strategy (v0.1): every public operation reads and validates the catalog
and the schema from disk exactly once, then works on that single snapshot.
Nothing is cached between calls, so edits to ``packages/catalog.json`` are seen
on the next request without restarting the process, and the API never serves
stale data. The catalog is small, so the cost of a read per request is
negligible; revisit this if the catalog grows or request volume justifies a
cache with explicit invalidation.

Validation is delegated to ``app.core.catalog_validation``, the same module the
CLI validator (``tools/validate_catalog.py``) and the CI use, so there is a
single source of truth for the catalog rules: the official JSON Schema plus
the unique-ID check that the schema cannot express.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.catalog_validation import (
    SchemaError,
    check_schema,
    load_json,
    validate_catalog_data,
)
from app.core.config import settings
from app.core.exceptions import CatalogError

_PUBLIC_MESSAGE = "The application catalog is unavailable."


class CatalogService:
    """Load, validate and query the application catalog."""

    def __init__(
        self,
        catalog_path: Path | None = None,
        schema_path: Path | None = None,
    ) -> None:
        """Use the given paths, or the ones from ``settings`` when omitted."""
        self.catalog_path = catalog_path or settings.catalog_path
        self.schema_path = schema_path or settings.catalog_schema_path

    def get_catalog(self) -> dict[str, Any]:
        """Return the full validated catalog."""
        return self._load_validated_catalog()

    def get_applications(self) -> list[dict[str, Any]]:
        """Return the validated list of applications."""
        return self._load_validated_catalog()["applications"]

    def get_application_by_id(
        self,
        application_id: str,
    ) -> dict[str, Any] | None:
        """Return the application whose ``id`` matches, or ``None``.

        Matches ``application.id`` only, never ``source.package_id``.
        """
        for application in self.get_applications():
            if application["id"] == application_id:
                return application
        return None

    def _load_validated_catalog(self) -> dict[str, Any]:
        """Read the schema and catalog once and return the validated catalog.

        Raises ``CatalogError`` if either file cannot be read, the schema is not
        valid Draft 2020-12, or the catalog breaks the schema or has duplicate
        application IDs.
        """
        schema = self._read_json(self.schema_path, "schema")

        try:
            check_schema(schema)
        except SchemaError as exc:
            raise CatalogError(
                _PUBLIC_MESSAGE,
                detail=f"Invalid JSON Schema {self.schema_path}: {exc.message}",
            ) from exc

        catalog = self._read_json(self.catalog_path, "catalog")

        # Covers the schema rules (required fields, types, patterns, enums,
        # additionalProperties) and duplicate application IDs.
        errors = validate_catalog_data(catalog, schema)
        if errors:
            raise CatalogError(
                _PUBLIC_MESSAGE,
                detail=(
                    f"Catalog {self.catalog_path} failed validation: "
                    + "; ".join(errors)
                ),
            )

        return catalog

    @staticmethod
    def _read_json(path: Path, label: str) -> Any:
        """Load a JSON file, translating I/O and parse errors into ``CatalogError``.

        ``label`` ("catalog" or "schema") only identifies the file in the
        internal error detail.
        """
        try:
            return load_json(path)
        except FileNotFoundError as exc:
            raise CatalogError(
                _PUBLIC_MESSAGE,
                detail=f"{label.capitalize()} file not found: {path}",
            ) from exc
        except json.JSONDecodeError as exc:
            raise CatalogError(
                _PUBLIC_MESSAGE,
                detail=(
                    f"Malformed JSON in {label} {path} at line {exc.lineno}, "
                    f"column {exc.colno}: {exc.msg}"
                ),
            ) from exc
        except (OSError, UnicodeDecodeError, RecursionError) as exc:
            # RecursionError: JSON nested too deeply for the parser.
            raise CatalogError(
                _PUBLIC_MESSAGE,
                detail=f"Could not read {label} {path}: {exc}",
            ) from exc

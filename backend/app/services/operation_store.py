"""JSON file registry of deployment operations.

No database (approved decision): one JSON file, rewritten atomically (temporary
file + ``os.replace``) under a process lock. This requires a single API process;
run Uvicorn without ``--workers``.

A damaged file is never silently replaced: the error surfaces as a 500 and the
file is left for inspection, so operation history cannot be lost by accident.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


class OperationStoreError(Exception):
    """The registry file cannot be read or written."""


class OperationStore:
    """Read and replace the list of operations. Callers hold the service lock."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, ValueError, RecursionError) as exc:
            raise OperationStoreError(f"Cannot read {self.path.name}: {exc}") from exc
        if not isinstance(data, dict) or not isinstance(data.get("operations"), list):
            raise OperationStoreError(f"{self.path.name} does not contain an operation list.")
        return data["operations"]

    def save(self, operations: list[dict[str, Any]]) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, temp_name = tempfile.mkstemp(dir=self.path.parent, prefix=".operations-", suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    json.dump({"operations": operations}, handle, indent=2)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_name, self.path)
            except BaseException:
                Path(temp_name).unlink(missing_ok=True)
                raise
        except OSError as exc:
            raise OperationStoreError(f"Cannot write {self.path.name}: {exc}") from exc

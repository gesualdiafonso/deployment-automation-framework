"""Append-only audit log of deployment operations (JSON Lines).

Only the fields listed in ``AUDIT_FIELDS`` are ever written, so a secret cannot
reach the log by accident: tokens, token hashes and headers have no field here.
"""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Reading is bounded: only the end of a large file is parsed.
MAX_READ_BYTES = 5 * 1024 * 1024
_FIELD_TYPES: dict[str, type] = {
    "operation_id": str,
    "application_id": str,
    "action": str,
    "mode": str,
    "state": str,
    "engine_status": str,
    "exit_code": int,
    "engine_operation_id": str,
    "log_file": str,
    "origin": str,
    "agent_id": str,
    "reason": str,
}

# The only fields a record can have besides timestamp and event (no secret has a field).
AUDIT_FIELDS = tuple(_FIELD_TYPES)


class AuditLogError(Exception):
    """The audit log cannot be written."""


class AuditLog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()

    def write(self, event: str, **fields: Any) -> None:
        unknown = set(fields) - set(AUDIT_FIELDS)
        if unknown:
            raise ValueError(f"Fields not allowed in the audit log: {sorted(unknown)}")
        record = {"timestamp": datetime.now(UTC).isoformat(), "event": event}
        record.update({key: value for key, value in fields.items() if value is not None})
        line = json.dumps(record, ensure_ascii=False) + "\n"
        with self._lock:
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as handle:
                    handle.write(line)
            except OSError as exc:
                raise AuditLogError(f"Cannot write the audit log: {exc}") from exc

    def read(self, limit: int, operation_id: str | None = None) -> dict[str, Any]:
        """Newest records first. Only allow-listed fields with the expected types are returned.

        The file is local and editable, so it is treated as untrusted: unknown
        fields are dropped, and lines that are not valid records are counted
        instead of failing the whole read.
        """
        with self._lock:
            if not self.path.exists():
                return {"records": [], "total": 0, "skipped_lines": 0, "truncated": False}
            try:
                size = self.path.stat().st_size
                truncated = size > MAX_READ_BYTES
                with self.path.open("rb") as handle:
                    if truncated:
                        handle.seek(size - MAX_READ_BYTES)
                    raw = handle.read()
            except OSError as exc:
                raise AuditLogError(f"Cannot read the audit log: {exc}") from exc

        lines = raw.decode("utf-8", errors="replace").splitlines()
        if truncated and lines:
            lines = lines[1:]  # the first line is probably cut in half
        records: list[dict[str, Any]] = []
        skipped = 0
        for line in lines:
            if not line.strip():
                continue
            record = _sanitize(line)
            if record is None:
                skipped += 1
            elif operation_id is None or record.get("operation_id") == operation_id:
                records.append(record)
        records.reverse()
        return {"records": records[:limit], "total": len(records), "skipped_lines": skipped, "truncated": truncated}


def _sanitize(line: str) -> dict[str, Any] | None:
    try:
        data = json.loads(line)
    except (ValueError, RecursionError):
        return None
    if not isinstance(data, dict):
        return None
    timestamp, event = data.get("timestamp"), data.get("event")
    if not isinstance(timestamp, str) or not isinstance(event, str):
        return None
    record: dict[str, Any] = {"timestamp": timestamp[:64], "event": event[:64]}
    for key, expected in _FIELD_TYPES.items():
        value = data.get(key)
        if isinstance(value, expected) and not isinstance(value, bool):
            record[key] = value[:500] if isinstance(value, str) else value
    return record

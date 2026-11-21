"""The API and the CLI share one validator and work from any directory."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

import app.core.catalog_validation as shared
import app.services.catalog_service as catalog_service
import tools.validate_catalog as cli
from app.core.config import PROJECT_ROOT, settings
from app.services.catalog_service import CatalogService

BACKEND_DIR = PROJECT_ROOT / "backend"
CLI_SCRIPT = PROJECT_ROOT / "tools" / "validate_catalog.py"


def _clean_env(**extra: str) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env.update(extra)
    return env


def _run(args: list[str], cwd: Path, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *args],
        cwd=cwd,
        env=_clean_env(**env),
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


@pytest.mark.parametrize(
    "name", ["load_json", "check_schema", "validate_catalog_data", "SchemaError"]
)
def test_service_uses_the_shared_implementation(name: str) -> None:
    assert getattr(catalog_service, name) is getattr(shared, name)


@pytest.mark.parametrize("name", ["load_json", "validate_catalog_data"])
def test_cli_uses_the_shared_implementation(name: str) -> None:
    assert getattr(cli, name) is getattr(shared, name)


def test_cli_and_service_use_the_same_default_paths() -> None:
    assert cli.DEFAULT_CATALOG == settings.catalog_path
    assert cli.DEFAULT_SCHEMA == settings.catalog_schema_path


def test_shared_module_does_not_load_tools_or_fastapi(tmp_path: Path) -> None:
    script = (
        "import sys\n"
        "import app.core.catalog_validation\n"
        "loaded = sorted(m for m in ('tools', 'fastapi', 'starlette') "
        "if m in sys.modules)\n"
        "print(','.join(loaded))\n"
    )

    result = _run(["-c", script], cwd=tmp_path, PYTHONPATH=str(BACKEND_DIR))

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""


def test_api_imports_outside_repository_root(tmp_path: Path) -> None:
    script = (
        "import sys\n"
        "from fastapi.testclient import TestClient\n"
        "from app.main import app\n"
        "from app.services.catalog_service import CatalogService\n"
        f"root = {str(PROJECT_ROOT)!r}\n"
        "assert root not in sys.path, 'repository root leaked into sys.path'\n"
        "assert 'tools' not in sys.modules, 'API imported the tools package'\n"
        "assert TestClient(app).get('/health').status_code == 200\n"
        "print(len(CatalogService().get_applications()))\n"
    )

    result = _run(["-c", script], cwd=tmp_path, PYTHONPATH=str(BACKEND_DIR))

    assert result.returncode == 0, result.stderr
    assert int(result.stdout.strip()) > 0


def test_service_reads_absolute_paths_from_any_cwd(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)

    explicit = CatalogService(
        catalog_path=settings.catalog_path.resolve(),
        schema_path=settings.catalog_schema_path.resolve(),
    )
    default = CatalogService()

    assert explicit.get_applications()
    assert explicit.get_catalog() == default.get_catalog()


def test_cli_runs_from_another_directory(tmp_path: Path) -> None:
    result = _run([str(CLI_SCRIPT)], cwd=tmp_path)

    assert result.returncode == 0, result.stderr
    assert result.stdout.startswith("Catalog validation passed: ")
    assert result.stdout.rstrip().endswith("application(s).")


# Documented exit codes: 0 valid, 1 invalid catalog, 2 file missing/unreadable/
# malformed or invalid schema. Runs main() in-process on temporary files.
@pytest.mark.parametrize(
    ("content", "expected_code", "expected_text"),
    [
        (None, 2, "File not found"),
        (b'{"schema_version": "1.0", "applications": [', 2, "Invalid JSON"),
        ('{"x": "café"}'.encode("latin-1"), 2, "Could not parse file"),
        (b"[" * 200_000, 2, "Could not parse file"),
        (b'{"schema_version": "1.0", "applications": [{"id": "x"}]}', 1, "Catalog validation failed"),
    ],
    ids=["missing", "malformed-json", "not-utf8", "deeply-nested", "invalid-catalog"],
)
def test_cli_exit_codes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    content: bytes | None,
    expected_code: int,
    expected_text: str,
) -> None:
    catalog = tmp_path / "catalog.json"
    if content is not None:
        catalog.write_bytes(content)
    monkeypatch.setattr(cli, "DEFAULT_CATALOG", catalog)

    code = cli.main()

    captured = capsys.readouterr()
    assert code == expected_code
    assert expected_text in captured.out + captured.err
    assert "Traceback" not in captured.err

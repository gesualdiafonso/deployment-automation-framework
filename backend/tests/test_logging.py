"""Tests for the API's application logging configuration."""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys

from app.core.config import PROJECT_ROOT
from app.main import LOG_FORMAT, configure_app_logging


def test_app_logger_has_one_formatted_handler_and_still_propagates() -> None:
    app_logger = logging.getLogger("app")

    assert len(app_logger.handlers) == 1
    assert app_logger.handlers[0].formatter is not None
    assert app_logger.handlers[0].formatter._fmt == LOG_FORMAT
    assert app_logger.propagate is True


def test_configure_app_logging_is_idempotent() -> None:
    configure_app_logging()
    configure_app_logging()

    assert len(logging.getLogger("app").handlers) == 1


def test_api_errors_are_logged_with_time_level_and_logger() -> None:
    # A separate interpreter, so the line is seen exactly as a server would emit it.
    script = (
        "import logging, app.main\n"
        "logging.getLogger('app.core.exceptions').error('Catalog error on GET /x: boom')\n"
    )
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env["PYTHONPATH"] = str(PROJECT_ROOT / "backend")
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert re.fullmatch(
        r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} ERROR app\.core\.exceptions: "
        r"Catalog error on GET /x: boom\n",
        result.stderr,
    ), result.stderr

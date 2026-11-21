"""DeployForge API application entry point."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError, ResponseValidationError

from app.api.routes import applications, health
from app.core.config import settings
from app.core.exceptions import (
    CatalogError,
    catalog_error_handler,
    request_validation_error_handler,
    response_validation_error_handler,
    unhandled_exception_handler,
)

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_app_logging() -> None:
    """Give the ``app`` loggers a timestamped format unless one is already set.

    Uvicorn configures only its own loggers; without a handler here, API errors
    fall back to Python's last-resort handler (message only, no time or level).
    Records still propagate, so external logging configuration keeps working.
    """
    app_logger = logging.getLogger("app")
    if not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(LOG_FORMAT))
        app_logger.addHandler(handler)
    if app_logger.level == logging.NOTSET:
        app_logger.setLevel(logging.INFO)


configure_app_logging()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=settings.description,
)

app.add_exception_handler(CatalogError, catalog_error_handler)
app.add_exception_handler(RequestValidationError, request_validation_error_handler)
app.add_exception_handler(ResponseValidationError, response_validation_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router)
app.include_router(applications.router, prefix=settings.api_prefix)

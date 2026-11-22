"""DeployForge API application entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError, ResponseValidationError

from app.api.routes import agent, applications, deployment, health
from app.core.config import settings
from app.core.exceptions import (
    CatalogError,
    catalog_error_handler,
    deployment_storage_error_handler,
    request_validation_error_handler,
    response_validation_error_handler,
    unhandled_exception_handler,
)
from app.services.audit_log import AuditLogError
from app.services.deployment_service import get_deployment_service
from app.services.operation_store import OperationStoreError

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

@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Create the deployment service at startup, which writes a fresh agent token.

    Uses the test override when one is installed, so tests never touch the real
    user profile.
    """
    provider = application.dependency_overrides.get(get_deployment_service, get_deployment_service)
    provider()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=settings.description,
    lifespan=lifespan,
)

app.add_exception_handler(CatalogError, catalog_error_handler)
app.add_exception_handler(RequestValidationError, request_validation_error_handler)
app.add_exception_handler(ResponseValidationError, response_validation_error_handler)
app.add_exception_handler(OperationStoreError, deployment_storage_error_handler)
app.add_exception_handler(AuditLogError, deployment_storage_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router)
app.include_router(applications.router, prefix=settings.api_prefix)
# Deployment interfaces (Day 5 Step 06): they queue work for the separate agent and never execute processes.
app.include_router(deployment.router, prefix=settings.api_prefix)
app.include_router(agent.router, prefix=settings.api_prefix)

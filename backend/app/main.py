"""DeployForge API application entry point."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError, ResponseValidationError

from app.api.routes import applications, health
from app.core.config import settings
from app.core.exceptions import (
    CatalogError,
    catalog_error_handler,
    request_validation_error_handler,
    response_validation_error_handler,
)

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=settings.description,
)

app.add_exception_handler(CatalogError, catalog_error_handler)
app.add_exception_handler(RequestValidationError, request_validation_error_handler)
app.add_exception_handler(ResponseValidationError, response_validation_error_handler)

app.include_router(health.router)
app.include_router(applications.router, prefix=settings.api_prefix)

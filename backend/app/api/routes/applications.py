"""Read-only application catalog endpoints."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, status

from app.schemas.application import (
    APPLICATION_ID_PATTERN,
    ApplicationListResponse,
    ApplicationResponse,
)
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/applications", tags=["applications"])

_ERROR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"detail": {"type": "string"}},
    "required": ["detail"],
}
_NOT_FOUND = {
    "description": "No application with this ID exists in the catalog.",
    "content": {"application/json": {"schema": _ERROR_SCHEMA}},
}
_INVALID_ID = {
    "description": (
        "Malformed application_id: it must match "
        f"{APPLICATION_ID_PATTERN} (lowercase letters, digits, single hyphens)."
    ),
    "content": {"application/json": {"schema": _ERROR_SCHEMA}},
}
_SERVER_ERROR = {
    "description": "The catalog could not be loaded or the response was invalid.",
    "content": {"application/json": {"schema": _ERROR_SCHEMA}},
}


def get_catalog_service() -> CatalogService:
    """Provide the catalog service (overridable in tests)."""
    return CatalogService()


CatalogServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]
ApplicationIdPath = Annotated[
    str,
    Path(
        pattern=APPLICATION_ID_PATTERN,
        description="Catalog application ID (not the source package_id).",
        examples=["google-chrome"],
    ),
]


# The handlers return plain dicts on purpose: FastAPI validates them against
# ``response_model`` (strict, extra="forbid"), and any contract violation is
# turned into a generic 500 by ``response_validation_error_handler``.


@router.get(
    "",
    response_model=ApplicationListResponse,
    responses={500: _SERVER_ERROR},
    summary="List catalog applications",
)
def list_applications(service: CatalogServiceDep) -> Any:
    """Return every catalog application and their count."""
    applications = service.get_applications()
    return {"applications": applications, "total": len(applications)}


@router.get(
    "/{application_id}",
    response_model=ApplicationResponse,
    responses={404: _NOT_FOUND, 422: _INVALID_ID, 500: _SERVER_ERROR},
    summary="Get one catalog application by its ID",
)
def get_application(
    application_id: ApplicationIdPath,
    service: CatalogServiceDep,
) -> Any:
    """Return the application whose catalog ``id`` matches.

    The ID format is validated before this runs (422 when malformed); a
    well-formed ID that is not in the catalog yields 404. Matches
    ``application.id`` only, never ``source.package_id``.
    """
    application = service.get_application_by_id(application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' not found.",
        )
    return application

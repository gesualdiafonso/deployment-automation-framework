"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health", status_code=status.HTTP_200_OK)
def get_health() -> dict[str, str]:
    """Report that the API process is up and which version is running."""
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.version,
    }

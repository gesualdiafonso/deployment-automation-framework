"""Domain exceptions and their HTTP error handlers for the DeployForge API."""

from __future__ import annotations

import logging

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE = "Internal server error."
INVALID_REQUEST_MESSAGE = "Invalid request parameter: {fields}."
INVALID_BODY_MESSAGE = "Invalid request body."
INVALID_REQUEST_GENERIC_MESSAGE = "Invalid request."


class CatalogError(Exception):
    """The application catalog could not be loaded or is not valid.

    Covers a missing catalog or schema file, malformed JSON, an invalid JSON
    Schema, a catalog that does not satisfy the schema, and duplicate
    application IDs.

    ``message`` is a short, generic text that is safe to show to API clients.
    ``detail`` carries the technical cause (paths, parser positions, schema
    errors) for logging and must not be returned to clients as-is.
    """

    def __init__(self, message: str, *, detail: str | None = None) -> None:
        """Store the client-safe ``message`` and the internal ``detail``."""
        super().__init__(message)
        self.message = message
        self.detail = detail


async def catalog_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Map ``CatalogError`` to a generic 500; keep the technical cause in logs."""
    message = exc.message if isinstance(exc, CatalogError) else INTERNAL_ERROR_MESSAGE
    detail = exc.detail if isinstance(exc, CatalogError) else repr(exc)

    logger.error(
        "Catalog error on %s %s: %s",
        request.method,
        request.url.path,
        detail,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": message},
    )


async def request_validation_error_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Map invalid request parameters to 422 in the API's ``{"detail": str}`` shape.

    Names the offending parameters only. The submitted values and the
    validator internals are not echoed back. A body that cannot be parsed
    (malformed JSON) has no field to name, so it gets a fixed message instead
    of the parser's position.
    """
    errors = exc.errors() if isinstance(exc, RequestValidationError) else []

    if any(error.get("type") == "json_invalid" for error in errors):
        return _unprocessable(INVALID_BODY_MESSAGE)

    fields = sorted(
        name
        for name in {_field_name(error.get("loc", ())) for error in errors}
        if name is not None
    )
    if fields:
        return _unprocessable(INVALID_REQUEST_MESSAGE.format(fields=", ".join(fields)))

    if any(error.get("loc", ())[:1] == ("body",) for error in errors):
        return _unprocessable(INVALID_BODY_MESSAGE)
    return _unprocessable(INVALID_REQUEST_GENERIC_MESSAGE)


def _field_name(loc: tuple[int | str, ...] | list[int | str]) -> str | None:
    """Return the innermost named field of an error location, if there is one.

    ``loc`` starts with where the value came from ("path", "query", "body",
    ...), which is skipped; integer parts are list indexes or parser
    positions, never names.
    """
    names = [part for part in tuple(loc)[1:] if isinstance(part, str)]
    return names[-1] if names else None


def _unprocessable(message: str) -> JSONResponse:
    """Build a 422 response in the API's ``{"detail": str}`` shape."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": message},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Map any unexpected exception to a generic 500 in the ``{"detail": str}`` shape.

    Starlette re-raises the exception after this response is sent, so the
    server still logs the full traceback; only a one-line summary is logged
    here, and nothing about the exception reaches the client.
    """
    logger.error(
        "Unhandled %s on %s %s",
        type(exc).__name__,
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": INTERNAL_ERROR_MESSAGE},
    )


async def response_validation_error_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Map a response that violates its ``response_model`` to a generic 500.

    This means the server produced data outside its own contract (e.g. the
    Pydantic models drifted from the catalog schema). Only field locations and
    error types are logged, not the offending values.
    """
    errors = exc.errors() if isinstance(exc, ResponseValidationError) else []
    summary = "; ".join(
        f"{'.'.join(str(part) for part in error.get('loc', ()))}: {error.get('type')}"
        for error in errors
    )

    logger.error(
        "Response validation failed on %s %s (%d error(s)): %s",
        request.method,
        request.url.path,
        len(errors),
        summary,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": INTERNAL_ERROR_MESSAGE},
    )


DEPLOYMENT_REGISTRY_MESSAGE = "The deployment registry is unavailable."


async def deployment_storage_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Registry or audit log failures: generic 500, details only in the server log."""
    logger.error("Deployment storage error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": DEPLOYMENT_REGISTRY_MESSAGE},
    )

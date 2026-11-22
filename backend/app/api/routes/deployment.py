"""Deployment interface for the UI: preview, request, follow and cancel operations.

Nothing here executes a process. Operations are queued for the separate
PowerShell agent (see app/api/routes/agent.py).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import require_loopback_host, require_trusted_ui_request
from app.schemas.deployment import (
    AuditLogResponse,
    DeploymentStatusResponse,
    Operation,
    OperationCreateRequest,
    OperationListResponse,
    OperationState,
    PreviewRequest,
    PreviewResponse,
)
from app.services.deployment_service import DeploymentError, DeploymentService, get_deployment_service

router = APIRouter(
    prefix="/deployment",
    tags=["deployment"],
    dependencies=[Depends(require_loopback_host)],
)

ServiceDep = Annotated[DeploymentService, Depends(get_deployment_service)]
TrustedOrigin = Annotated[str, Depends(require_trusted_ui_request)]


def _raise(error: DeploymentError) -> None:
    raise HTTPException(error.status_code, error.detail) from error


@router.get("/status", response_model=DeploymentStatusResponse, summary="Deployment agent and queue status")
def get_status(service: ServiceDep) -> Any:
    """Agent heartbeat data (null until the agent reports) and queue counts."""
    return service.get_status()


@router.post("/preview", response_model=PreviewResponse, summary="Preview an install or uninstall")
def preview(body: PreviewRequest, service: ServiceDep, _origin: TrustedOrigin) -> Any:
    """Validate against the catalog and return a single-use confirmation token. Runs nothing."""
    try:
        return service.preview(body.application_id, body.action, body.mode)
    except DeploymentError as error:
        _raise(error)


@router.post(
    "/operations",
    response_model=Operation,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request an operation (queued for the agent)",
)
def create_operation(body: OperationCreateRequest, service: ServiceDep, origin: TrustedOrigin) -> Any:
    """install/uninstall need the confirmation token from /preview; detect is read-only and needs none."""
    try:
        return service.create_operation(
            body.application_id, body.action, body.mode, body.confirmation_token, origin
        )
    except DeploymentError as error:
        _raise(error)


@router.get("/operations", response_model=OperationListResponse, summary="List operations, newest first")
def list_operations(
    service: ServiceDep,
    state: OperationState | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> Any:
    return service.list_operations(state, limit)


@router.get("/operations/{operation_id}", response_model=Operation, summary="Get one operation")
def get_operation(operation_id: str, service: ServiceDep) -> Any:
    try:
        return service.get_operation(operation_id)
    except DeploymentError as error:
        _raise(error)


@router.post("/operations/{operation_id}/cancel", response_model=Operation, summary="Cancel a queued operation")
def cancel_operation(operation_id: str, service: ServiceDep, origin: TrustedOrigin) -> Any:
    """Only queued operations can be cancelled: stopping winget mid-install is not safe."""
    try:
        return service.cancel_operation(operation_id, origin)
    except DeploymentError as error:
        _raise(error)


@router.get("/audit", response_model=AuditLogResponse, summary="Read the deployment audit log, newest first")
def read_audit_log(
    service: ServiceDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    operation_id: Annotated[str | None, Query(max_length=64)] = None,
) -> Any:
    """Records from logs/audit/deployforge-audit.jsonl: allow-listed fields only, newest first."""
    return service.audit.read(limit, operation_id)

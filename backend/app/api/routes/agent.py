"""Interface for the local DeployForge agent (PowerShell). Not for browsers."""

from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from app.core.security import bearer_token, require_loopback_host
from app.schemas.deployment import AgentClaimResponse, AgentHeartbeat, AgentResultRequest, Operation
from app.services.deployment_service import DeploymentError, DeploymentService, get_deployment_service

ServiceDep = Annotated[DeploymentService, Depends(get_deployment_service)]
_AGENT_ID = re.compile(r"^[A-Za-z0-9-]{1,64}$")


def require_agent(
    service: ServiceDep,
    authorization: Annotated[str | None, Header()] = None,
    origin: Annotated[str | None, Header()] = None,
    x_deployforge_agent_id: Annotated[str | None, Header(alias="X-DeployForge-Agent-Id")] = None,
) -> str | None:
    """Bearer token from the user's profile; any Origin header means a browser, which is refused."""
    if origin is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Browsers cannot use the agent interface.")
    token = bearer_token(authorization)
    if token is None or not service.agent_token.verify(token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid agent token.")
    if x_deployforge_agent_id is not None and _AGENT_ID.fullmatch(x_deployforge_agent_id):
        return x_deployforge_agent_id
    return None


router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[Depends(require_loopback_host)],
)
AgentId = Annotated[str | None, Depends(require_agent)]


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT, summary="Agent heartbeat")
def heartbeat(body: AgentHeartbeat, service: ServiceDep, _agent: AgentId) -> Response:
    service.record_heartbeat(body)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/operations/claim",
    response_model=AgentClaimResponse,
    responses={204: {"description": "Nothing to run."}},
    summary="Take the oldest queued operation",
)
def claim(service: ServiceDep, agent_id: AgentId) -> Any:
    claimed = service.claim(agent_id or "unknown")
    if claimed is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return claimed


@router.post("/operations/{operation_id}/result", response_model=Operation, summary="Report an operation result")
def report_result(operation_id: str, body: AgentResultRequest, service: ServiceDep, agent_id: AgentId) -> Any:
    try:
        return service.record_result(operation_id, body, agent_id)
    except DeploymentError as error:
        raise HTTPException(error.status_code, error.detail) from error

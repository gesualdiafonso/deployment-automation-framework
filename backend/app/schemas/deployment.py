"""Contracts of the deployment interface (UI side) and of the deployment agent.

Only three typed values ever describe an operation: ``application_id``,
``action`` and ``mode``. No command, path or argument crosses the API: the
PowerShell engine builds the winget arguments itself.
"""

from __future__ import annotations

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.application import APPLICATION_ID_PATTERN, ApplicationResponse

_STRICT = ConfigDict(extra="forbid", strict=True)

Action = Literal["install", "uninstall", "detect"]
"""install/uninstall change the machine; detect only runs ``winget list``."""
Mode = Literal["dry_run", "execute"]
OperationState = Literal["queued", "claimed", "completed", "failed", "cancelled", "expired", "lost"]
EngineStatus = Literal[
    "Installed", "AlreadyInstalled", "Uninstalled", "NotInstalled", "Failed", "DryRun", "Skipped"
]
AgentState = Literal["never_seen", "online", "offline", "unsupported"]
Platform = Literal["windows", "macos", "linux"]

ENGINE_OPERATION_ID_PATTERN = r"^[0-9a-f]{8}$"
LOG_FILE_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]*\.log$"
CONFIRMATION_TOKEN_PATTERN = r"^[A-Za-z0-9_-]{20,128}$"


def _check_mode(action: str, mode: str | None) -> None:
    if action == "detect" and mode is not None:
        raise ValueError("mode must be omitted for detect (it never changes the machine)")
    if action != "detect" and mode is None:
        raise ValueError("mode is required for install and uninstall")


# --- UI side -----------------------------------------------------------------


class PreviewRequest(BaseModel):
    """Ask what an operation would do, and get a confirmation token for it."""

    model_config = _STRICT

    application_id: str = Field(pattern=APPLICATION_ID_PATTERN)
    action: Literal["install", "uninstall"]
    mode: Mode


class PreviewResponse(BaseModel):
    """What would be done, and the single-use token needed to request it."""

    model_config = _STRICT

    application: ApplicationResponse
    action: Literal["install", "uninstall"]
    mode: Mode
    supported: bool
    notes: list[str]
    warnings: list[str]
    agent_ready: bool
    confirmation_token: str | None
    expires_at: str | None


class OperationCreateRequest(BaseModel):
    """Request an operation. install/uninstall need the token from a preview."""

    model_config = _STRICT

    application_id: str = Field(pattern=APPLICATION_ID_PATTERN)
    action: Action
    mode: Mode | None = None
    confirmation_token: str | None = Field(default=None, pattern=CONFIRMATION_TOKEN_PATTERN)

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        _check_mode(self.action, self.mode)
        if self.action == "detect" and self.confirmation_token is not None:
            raise ValueError("detect does not take a confirmation token")
        if self.action != "detect" and self.confirmation_token is None:
            raise ValueError("confirmation_token is required for install and uninstall")
        return self


class OperationResult(BaseModel):
    """What the agent reported. Every field comes from the engine or the agent."""

    model_config = _STRICT

    engine_status: EngineStatus | None
    exit_code: int | None
    verified: bool | None
    detected_installed: bool | None
    message: str = Field(max_length=2000)
    engine_operation_id: str | None = Field(pattern=ENGINE_OPERATION_ID_PATTERN)
    log_file: str | None = Field(pattern=LOG_FILE_PATTERN, max_length=200)


class Operation(BaseModel):
    """One deployment operation, as stored in the registry."""

    model_config = _STRICT

    operation_id: str
    application_id: str
    application_name: str
    action: Action
    mode: Mode | None
    state: OperationState
    created_at: str
    claimed_at: str | None
    finished_at: str | None
    result: OperationResult | None
    error: str | None


class OperationListResponse(BaseModel):
    model_config = _STRICT

    operations: list[Operation]
    total: int


class WingetInfo(BaseModel):
    model_config = _STRICT

    available: bool
    version: str | None = Field(default=None, max_length=50)


class AgentInfo(BaseModel):
    """Latest heartbeat data. Fields are null until the agent has reported them."""

    model_config = _STRICT

    state: AgentState
    last_heartbeat_at: str | None
    platform: Platform | None
    os_version: str | None
    powershell_version: str | None
    engine_version: str | None
    elevated: bool | None
    winget: WingetInfo | None
    execute_enabled: bool | None


class QueueInfo(BaseModel):
    model_config = _STRICT

    queued: int
    running: int


class DeploymentStatusResponse(BaseModel):
    model_config = _STRICT

    agent: AgentInfo
    queue: QueueInfo


class AuditRecord(BaseModel):
    """One audit log line. Only these fields are ever returned."""

    model_config = _STRICT

    timestamp: str
    event: str
    operation_id: str | None = None
    application_id: str | None = None
    action: str | None = None
    mode: str | None = None
    state: str | None = None
    engine_status: str | None = None
    exit_code: int | None = None
    engine_operation_id: str | None = None
    log_file: str | None = None
    origin: str | None = None
    agent_id: str | None = None
    reason: str | None = None


class AuditLogResponse(BaseModel):
    model_config = _STRICT

    records: list[AuditRecord]
    total: int
    skipped_lines: int
    truncated: bool


# --- Agent side --------------------------------------------------------------


class AgentHeartbeat(BaseModel):
    """Sent by the agent every few seconds, also while an operation runs."""

    model_config = _STRICT

    agent_id: str = Field(pattern=r"^[A-Za-z0-9-]{1,64}$")
    platform: Platform
    os_version: str = Field(max_length=200)
    powershell_version: str = Field(max_length=50)
    engine_version: str = Field(max_length=50)
    elevated: bool
    winget: WingetInfo
    execute_enabled: bool
    current_operation_id: str | None = Field(default=None, max_length=64)


class AgentClaimResponse(BaseModel):
    """The only data the agent receives: three typed values and an ID."""

    model_config = _STRICT

    operation_id: str
    application_id: str = Field(pattern=APPLICATION_ID_PATTERN)
    action: Action
    mode: Mode | None


class AgentResultRequest(BaseModel):
    """Outcome of an operation. ``error`` is set when the engine threw."""

    model_config = _STRICT

    result: OperationResult | None = None
    error: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _one_of(self) -> Self:
        if (self.result is None) == (self.error is None):
            raise ValueError("exactly one of result or error is required")
        return self

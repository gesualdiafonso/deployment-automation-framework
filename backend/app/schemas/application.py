"""Response contracts for the read-only application endpoints.

The models mirror ``catalog/schema/catalog.schema.json``, which remains the
source of truth for catalog validation (enforced by ``CatalogService``). The
constraints are repeated here so the OpenAPI contract is precise; the test
suite fails if they drift from the official JSON Schema.
"""

from __future__ import annotations

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

APPLICATION_ID_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
SAFE_TOKEN_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._+-]*$"

_MODEL_CONFIG = ConfigDict(extra="forbid", strict=True)


class ApplicationSource(BaseModel):
    """Where the application package is obtained from."""

    model_config = _MODEL_CONFIG

    type: Literal["winget", "msstore", "direct", "local"]
    package_id: str = Field(pattern=SAFE_TOKEN_PATTERN)


class ApplicationDeployment(BaseModel):
    """How the application is deployed."""

    model_config = _MODEL_CONFIG

    type: Literal["powershell", "psadt"]
    entry_point: str = Field(min_length=1)


class ApplicationResponse(BaseModel):
    """A single catalog application."""

    model_config = _MODEL_CONFIG

    id: str = Field(pattern=APPLICATION_ID_PATTERN)
    name: str = Field(min_length=1)
    version: str = Field(pattern=SAFE_TOKEN_PATTERN)
    source: ApplicationSource
    deployment: ApplicationDeployment


class ApplicationListResponse(BaseModel):
    """The collection of catalog applications."""

    model_config = _MODEL_CONFIG

    applications: list[ApplicationResponse]
    total: int = Field(ge=0)

    @model_validator(mode="after")
    def _total_matches_applications(self) -> Self:
        """Reject a ``total`` that differs from the number of applications."""
        if self.total != len(self.applications):
            raise ValueError(
                f"total ({self.total}) must equal the number of "
                f"applications ({len(self.applications)})"
            )
        return self

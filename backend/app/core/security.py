"""Request checks for the deployment and agent interfaces.

CORS is not relied on for protection: browsers send cross-site requests
anyway, CORS only hides the answer. These checks reject them before any work:

- Host must be loopback (blocks DNS rebinding);
- UI writes need an allowed Origin and the X-DeployForge-Request header
  (an HTML form cannot set either; a cross-origin fetch with it needs a
  preflight the API never approves);
- install/uninstall additionally need the single-use confirmation token,
  which only a same-origin page can read from the preview response;
- agent calls need the bearer token from the user's profile and must not
  carry an Origin header, so a browser page can never act as the agent.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Header, HTTPException, Request, status

from app.core.config import settings

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "[::1]"})
CSRF_HEADER = "X-DeployForge-Request"


def _hostname(host_header: str) -> str:
    if host_header.startswith("["):
        return host_header.split("]", 1)[0] + "]"
    return host_header.rsplit(":", 1)[0] if ":" in host_header else host_header


def require_loopback_host(request: Request) -> None:
    """Reject any Host that is not the local machine (DNS rebinding)."""
    host = request.headers.get("host", "")
    if _hostname(host).lower() not in LOOPBACK_HOSTS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requests must target the local DeployForge API.")


def require_trusted_ui_request(
    origin: Annotated[str | None, Header()] = None,
    x_deployforge_request: Annotated[str | None, Header(alias=CSRF_HEADER)] = None,
) -> str:
    """Accept a state-changing UI request only from an allowed origin with the CSRF header."""
    if origin is None or origin.rstrip("/") not in settings.allowed_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Origin not allowed.")
    if x_deployforge_request != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing {CSRF_HEADER} header.")
    return origin.rstrip("/")


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None

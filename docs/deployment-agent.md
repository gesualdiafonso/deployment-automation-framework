# Deployment interface and local agent

How the DeployForge UI installs, uninstalls and detects applications without the API ever running a process. Implemented in Day 5 (design approved in Step 06).

## Architecture

```text
Browser (frontend)            FastAPI on 127.0.0.1 (one process)        DeployForge agent (PowerShell, same user)
------------------            ---------------------------------        -----------------------------------------
GET  /deployment/status   ─►  operation registry (JSON file + lock)    loop, no listening port:
POST /deployment/preview  ─►  catalog check, single-use token           heartbeat every 10 s ─────► /agent/heartbeat
POST /deployment/operations ► token check, queued                       claim ────────────────────► /agent/operations/claim
GET  /deployment/operations[/{id}]                                      Invoke-DeployForgeDeployment / Get-DeployForgeApplicationState
                              audit log (JSON Lines)  ◄──────────────── result ───────────────────► /agent/operations/{id}/result
```

- The API only validates, records and hands over work. It never executes a process (a test checks this with a Python audit hook).
- The agent opens no port. It calls the API, runs the engine, and reports the engine's structured result.
- Only three typed values describe an operation: `application_id`, `action` (`install`, `uninstall`, `detect`) and `mode` (`dry_run`, `execute`; none for `detect`). No command, path or argument crosses the API: the engine builds the winget arguments.
- On macOS and Linux the API and catalog work; the agent refuses to start and every deployment is reported as unsupported.

## Running it

```powershell
# 1. API (writes a fresh agent token to %LOCALAPPDATA%\DeployForge\agent.token)
python -m uvicorn app.main:app --app-dir backend

# 2. Agent, in another terminal (dry run and detect only)
Import-Module ./src/powershell/DeployForgeAgent/DeployForgeAgent.psd1
Start-DeployForgeAgent

# Real installs and uninstalls: opt in explicitly when starting the agent
$env:DEPLOYFORGE_AGENT_ALLOW_EXECUTE = '1'
Start-DeployForgeAgent
```

Then open the frontend (`npm run dev` in `frontend/`) and go to **Deployments**.

| Variable | Used by | Meaning |
|---|---|---|
| `DEPLOYFORGE_ALLOWED_ORIGINS` | API | Comma-separated origins allowed to request deployments. Default `http://127.0.0.1:5173,http://localhost:5173` |
| `DEPLOYFORGE_AGENT_TOKEN_FILE` | API and agent | Agent token file. Default `%LOCALAPPDATA%\DeployForge\agent.token` |
| `DEPLOYFORGE_AGENT_ALLOW_EXECUTE` | agent | `1` enables real execution. Anything else: dry run and detect only |

Run Uvicorn as a single process (no `--workers`): the registry is a JSON file protected by an in-process lock.

## Flow

1. The user selects an application. **Detect** queues a read-only `winget list` through the agent.
2. **Install/Uninstall** first calls `POST /deployment/preview`. Nothing runs; the API checks the catalog and returns a single-use confirmation token (120 s).
3. The UI shows exactly what was approved: application, ID, package, action, mode, current state, warnings. A real uninstall requires typing the application ID.
4. On confirmation, `POST /deployment/operations` validates the token again and queues the operation (`202`).
5. The agent claims it, runs `Invoke-DeployForgeDeployment` (`-WhatIf` for dry runs, `-Confirm:$false` only when execution is enabled), and reports the result.
6. The UI follows `GET /deployment/operations/{id}` every second until it ends.

## API contract

All errors use `{"detail": str}`. The three catalog endpoints are unchanged.

### UI interface

Writes need an allowed `Origin`, the header `X-DeployForge-Request: 1`, and JSON. Every route needs a loopback `Host`.

| Method and path | Request | Response |
|---|---|---|
| `GET /api/v1/deployment/status` | — | `200` agent heartbeat data (null until the agent reports) and queue counts |
| `POST /api/v1/deployment/preview` | `{application_id, action: install\|uninstall, mode}` | `200 {application, action, mode, supported, notes[], warnings[], agent_ready, confirmation_token, expires_at}`; `404` unknown ID; `422` malformed |
| `POST /api/v1/deployment/operations` | `{application_id, action, mode, confirmation_token}` or `{application_id, action: "detect"}` | `202 operation`; `403` origin, header or token invalid; `409` operation already active for the application, execution disabled, or unsupported platform; `503` no agent online |
| `GET /api/v1/deployment/operations?state=&limit=50` | — | `200 {operations[], total}`, newest first |
| `GET /api/v1/deployment/operations/{operation_id}` | — | `200 operation`; `404` |
| `POST /api/v1/deployment/operations/{operation_id}/cancel` | — | `200 operation` when it was queued; `409` otherwise |
| `GET /api/v1/deployment/audit?limit=200&operation_id=` | — | `200 {records[], total, skipped_lines, truncated}`, newest first. Only allow-listed fields are returned, even if the file was edited; unreadable lines are counted, not fatal; only the last 5 MB are read |

`operation`: `operation_id`, `application_id`, `application_name`, `action`, `mode`, `state`, `created_at`, `claimed_at`, `finished_at`, `error`, and `result` = `{engine_status, exit_code, verified, detected_installed, message, engine_operation_id, log_file}`. `log_file` is a file name only, never a path.

### Agent interface

`Authorization: Bearer <token from the token file>`. Requests carrying an `Origin` header are refused, so a web page can never act as the agent.

| Method and path | Purpose |
|---|---|
| `POST /api/v1/agent/heartbeat` | Platform, OS, PowerShell and engine versions, elevation, winget, execution flag. `204` |
| `POST /api/v1/agent/operations/claim` | Oldest queued operation as `{operation_id, application_id, action, mode}`, or `204`. Nothing while one is running |
| `POST /api/v1/agent/operations/{id}/result` | `{result}` or `{error}`; only for the operation that is running |

## States

```text
queued ──claim──► claimed ──result──► completed  (Installed, AlreadyInstalled, Uninstalled, NotInstalled, DryRun, or a detection)
  │                  │       └──────► failed     (engine Failed/Skipped, engine exception, execution disabled)
  │                  └─ agent silent 60 s ──► lost   (outcome unknown: run Detect before retrying)
  ├─ cancel ──► cancelled  (only while queued)
  └─ not claimed in 10 min ──► expired
```

One operation runs at a time, and one is active per application. Running operations cannot be cancelled: stopping winget mid-install is not safe.

## Security

| Threat | Mitigation |
|---|---|
| Malicious website (CSRF) | Allowed `Origin` + `X-DeployForge-Request` header + JSON; install/uninstall also need the confirmation token, which only a same-origin page can read from the preview. CORS is not relied on |
| DNS rebinding | `Host` must be `127.0.0.1`, `localhost` or `[::1]` on the deployment and agent routes |
| Injection | Strict models (`extra="forbid"`), ID pattern, catalog lookup, action and mode allowlists in the API, the agent and the engine |
| Replay | Token single-use, 120 s, bound to application, action and mode; stored only as a SHA-256 hash in memory |
| Fake agent | Token file in the user profile, rotated on every API start, compared in constant time |
| Double submission | UI lock and disabled buttons; one active operation per application in the API; single-use token |
| Excess privilege | The agent never elevates. If it runs elevated, the status shows it |
| Secret leakage | The audit log has a fixed field list with no secret fields; tokens never appear in URLs |

### Known limits

- **One OS user per machine.** `127.0.0.1` is reachable by every local user. Another local user could queue operations through the UI endpoints that your agent would run. Multi-user machines need OS-level authentication (planned with Tauri).
- No user identity: the audit log records the request origin, not a person.
- Per-application permission needs are unknown: installers that need administrator rights fail or show UAC.
- winget has no timeout in the engine; a hung operation stays running until the agent stops reporting.
- Dry runs do not detect the current state (`-WhatIf` skips detection). Use Detect.
- The audit log and registry are local files the same user can edit.
- No real install or uninstall has been verified yet (Day 4 Sandbox evidence is still missing).

## Logs and records

| Kind | Source | Exposed by the API |
|---|---|---|
| Operation history | `backend/data/deployment-operations.json` | `GET /deployment/operations` |
| Audit records | `logs/audit/deployforge-audit.jsonl` | `GET /deployment/audit` |
| Engine log per real operation | `logs/*.log` | File name only (`result.log_file`); content not exposed |
| Process logs | API and agent console | Not exposed |

Not exposed on purpose (not approved in Step 08): engine log content, API host OS and Python version, process logs.

## Files

| Path | Content |
|---|---|
| `backend/data/deployment-operations.json` | Operation registry (git-ignored, last 500 operations) |
| `logs/audit/deployforge-audit.jsonl` | Audit log (git-ignored, append-only) |
| `logs/*.log` | Engine log per real operation (unchanged) |

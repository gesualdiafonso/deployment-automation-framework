# Security

This page describes the protections that exist in the code today and the known limits. It does not describe planned features as if they were implemented.

## Secrets

- No credentials, tokens, or client secrets are stored in the repository, and no component uses any: there is no Microsoft Graph, Entra ID, Intune, or Configuration Manager integration yet.
- `.env` files are ignored by Git.
- The `Security` workflow runs gitleaks on pull requests, on pushes to `main`, and weekly.

## Binaries

Installers are never committed. `.gitignore` excludes `*.msi`, `*.exe`, `*.intunewin`, and `*.zip`. The catalog stores package identifiers only; WinGet downloads the installers at deployment time.

## DeployForge engine (PowerShell)

The engine really installs and uninstalls software, so it is built to refuse rather than guess:

| Protection | How |
|---|---|
| Dry run | `-WhatIf` runs nothing (no detection, no winget, no log). |
| Confirmation | `ConfirmImpact = High`: it asks before acting unless `-Confirm:$false` is passed. |
| No arbitrary commands | winget is the only program it runs. Arguments are built by the engine from fixed verbs and passed as an array, with no shell and no `Invoke-Expression`. The `-Id` given by the user is never passed to winget. |
| Catalog values | `package_id` and `version` must match `^[A-Za-z0-9][A-Za-z0-9._+-]*$` (no spaces, no leading `-`, no shell characters). Values that become arguments must be plain strings. An application ID that appears more than once is rejected. `entry_point` must be a relative path that stays inside the repository. |
| Recorded before executed | The log is created before anything is detected or executed. If it cannot be written, the operation ends as `Failed` and winget is not run. |
| Verified results | A non-zero winget exit code is always `Failed`. A zero exit code counts as success only if a second detection confirms the expected state. |
| Platform | winget is only executed on Windows; elsewhere the engine refuses. |

Privileges: the engine does not require or request elevation. Per-user installers work without it; machine-wide installers may need an elevated session. Each operation log records whether the session was elevated (`Session elevated: True/False`), but nothing is enforced.

Run real installations only in a disposable virtual machine or Windows Sandbox. `tools/Test-DeployForgeLifecycle.ps1` refuses to run outside Windows Sandbox unless `-AllowRealInstall` is passed.

## REST API (FastAPI)

- Read-only: only `GET`. Any other method returns `405`.
- It never runs WinGet, PowerShell, subprocesses, or system commands. This was checked at runtime with a Python audit hook while exercising every route.
- `application_id` is validated before the catalog is read; malformed values return `422` without echoing the value.
- Error responses never contain stack traces, file paths, parser messages, or submitted values; the technical cause goes to the server log only.
- The deployment and agent endpoints have their own protections (origin and CSRF checks, confirmation tokens, agent token): see [deployment-agent.md](deployment-agent.md#security).
- There is **no user authentication**. Uvicorn binds to `127.0.0.1` by default: keep it that way, do not use `--host 0.0.0.0`, and do not run the API as an administrator.

## CI

- Every workflow has `contents: read` as its only permission (gitleaks also reads pull requests).
- No deployment credentials exist in CI, and no workflow runs the engine against real packages: every Pester test that reaches the execution path mocks winget.
- pip-audit checks `backend/requirements.txt`; Dependabot proposes updates weekly.

## Known limits

- The winget executable is resolved from `PATH`; its location is not verified.
- winget calls have no timeout.
- The engine matches application IDs case-insensitively; the API does not.
- A pinned `version` is not compared with the installed version during detection.
- Uvicorn's access log records full query strings.
- GitHub Actions are pinned by tag, not by commit SHA.

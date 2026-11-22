# Day 4 validation evidence

Collected on 2026-11-21 (UTC). Every result below comes from a real run; nothing is reconstructed or estimated. Where something was not done, the page says so.

## Scope and environment

| Item | Value |
|---|---|
| Code validated locally | Commit `22a0e05` plus the uncommitted Day 4 corrections in the working tree |
| Code validated by remote CI | Commit `22a0e05` only (the Day 4 corrections had not been pushed when this was collected) |
| OS | Windows 11 Pro 10.0.26200 |
| Python | 3.12.10 |
| PowerShell | 7.6.10 (and Windows PowerShell 5.1.26100 for parser checks) |
| Pester / PSScriptAnalyzer | 6.2.0 / 1.25.0 |

Evidence types used below:

| Label | Meaning |
|---|---|
| **Automated** | A test in the repository suite that asserts the behaviour. |
| **Mock** | Behaviour exercised with winget replaced by a test double. Proves the engine's logic, not winget's real behaviour. |
| **Local run** | A command run on the machine above, outside the test suites. |
| **Remote CI** | A GitHub Actions run. |
| **Real VM** | A real install or uninstall in Windows Sandbox or a virtual machine. |

## Results

### Python tests (Automated, Local run)

`python -m pytest tests/python backend/tests -v -W error::DeprecationWarning`: **270 passed**, 0 failed. The same result in reverse order and in two shuffled orders.

| File | Tests |
|---|---|
| `tests/python/test_catalog.py` | 5 |
| `backend/tests/test_application_schemas.py` | 93 |
| `backend/tests/test_applications_api.py` | 106 |
| `backend/tests/test_catalog_service.py` | 30 |
| `backend/tests/test_catalog_validation_shared.py` | 16 |
| `backend/tests/test_health.py` | 5 |
| `backend/tests/test_logging.py` | 3 |
| `backend/tests/test_request_validation_handler.py` | 12 |

### PowerShell tests (Automated, Mock, Local run)

`Invoke-Pester -Path tests/powershell`: **47 passed**, 0 failed, 0 skipped. Every test that reaches the execution path mocks winget (14 of 14, checked statically).

| Describe | Tests |
|---|---|
| `Get-DeployForgeApplication` | 5 |
| `Get-DeployForgeDeploymentPlan` | 17 |
| `Test-DeployForgeApplicationInstalled` | 3 |
| `Confirm-DeployForgeApplicationState` | 2 |
| `Write-DeployForgeLog` | 1 |
| `Invoke-DeployForgeDeployment` | 19 |

### Static analysis (Local run)

| Scope | Result |
|---|---|
| CI settings (Error, Warning) on `src` and `tests/powershell` | 0 findings |
| All severities, including `tools/` (not analysed by CI) | 11 × `PSAvoidUsingWriteHost` (Warning) in the three interactive `tools/` scripts; 1 × `PSUseOutputTypeCorrectly` (Information) in `Get-DeployForgeApplication.ps1`. Reviewed: console output of manual tools, and an informational type declaration. Not fixed. |
| Windows PowerShell 5.1 parser on the changed engine files | 0 parse errors. The module itself still requires PowerShell 7.2 (manifest). |

### Catalog (Local run)

`python tools/validate_catalog.py`: `Catalog validation passed: 21 application(s).`, exit code `0`. The catalog and schema files are unchanged from `22a0e05`.

### API (Local run against Uvicorn, Automated)

`python -m uvicorn app.main:app --app-dir backend --port 8003`:

| Request | Status | Body |
|---|---|---|
| `GET /health` | 200 | `{"status":"ok","service":"DeployForge API","version":"0.1.0"}` |
| `GET /api/v1/applications` | 200 | 21 applications, `"total": 21` |
| `GET /api/v1/applications/google-chrome` | 200 | the catalog record |
| `GET /api/v1/applications/application-inexistente` | 404 | `{"detail":"Application 'application-inexistente' not found."}` |
| `GET /api/v1/applications/Google.Chrome` | 422 | `{"detail":"Invalid request parameter: application_id."}` |
| `GET /api/v1/applications/` | 307 | redirect to `/api/v1/applications` |
| `POST /api/v1/applications` | 405 | `{"detail":"Method Not Allowed"}` |
| `GET /api/v1/packages` | 404 | `{"detail":"Not Found"}` |
| `GET /docs`, `/redoc`, `/openapi.json` | 200 | — |

- **Contract preserved:** the OpenAPI document generated from the working tree is byte-identical to the one generated from `22a0e05`.
- **Unexpected errors and a deeply nested catalog** return `500` with `application/json` and the documented body. This was observed on Uvicorn, and is also covered by Automated tests.
- **No command execution:** a Python audit hook recorded no process, `os.system`, `exec`, or `ctypes` events across 34 requests covering every route, method, and error path. The only files the API opened were the catalog and the schema.

### Dry run (Local run, real catalog)

`Invoke-DeployForgeDeployment -WhatIf` for `google-chrome`, `whatsapp` (msstore), and `7zip`, for both install and uninstall: all six returned `Status = DryRun` with an empty `LogPath`, and the log directory was not created. Commands shown:

```text
winget install --id Google.Chrome --exact --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
winget uninstall --id 9NKSQGP7F2NH --exact --source msstore --silent --accept-source-agreements --disable-interactivity
```

### Installation, detection, and uninstallation

| Evidence type | Status |
|---|---|
| **Mock** | 14 lifecycle scenarios pass with a stateful winget double: not installed, already installed, winget unavailable, success and failure exit codes, detection failure before and after the action, install and uninstall failures, invalid and unknown IDs, dry runs, repeated install, and repeated uninstall. A non-zero exit code is never reported as success, and a zero exit code counts only after detection confirms it. |
| **Real VM** | **Attempted, not achieved.** On 2026-11-21, `tools/sandbox/Start-DeployForgeSandbox.ps1 -Id 7zip` started Windows Sandbox with the current code. The bootstrap downloaded PowerShell 7.4.6, then failed to install WinGet (App Installer) with `HRESULT 0x80073CF3` (the package failed update, dependency, or conflict validation). The lifecycle test never started, so nothing was installed or uninstalled and there is still no real install evidence. The WinGet bootstrap in `tools/sandbox/Invoke-SandboxEntry.ps1` has to be fixed before this can be retried. |

### Logging (Mock, Local run)

A simulated install (temporary catalog, winget double) produced this log, which matches the documented flow:

```text
2026-11-21T15:53:24.4775140+00:00 [INFO] Operation 847d18ae started: action Install for 'audit-app' (winget: DeployForge.Audit.DoesNotExist).
2026-11-21T15:53:24.4793005+00:00 [INFO] Planned command: winget install --id DeployForge.Audit.DoesNotExist --exact --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
2026-11-21T15:53:24.4895601+00:00 [INFO] Session elevated: False.
2026-11-21T15:53:24.5023473+00:00 [INFO] Detected state before: installed=False.
2026-11-21T15:53:24.5155169+00:00 [INFO] Running winget install.
2026-11-21T15:53:24.5241133+00:00 [DEBUG] winget: fake winget install output
2026-11-21T15:53:24.5362631+00:00 [INFO] Verification after install: matched=True.
2026-11-21T15:53:24.5456068+00:00 [INFO] Result: Installed. Application installed and detected afterwards.
```

When the log cannot be created, the operation returns `Failed` and winget is not called (Automated).

### GitHub Actions (Remote CI)

All runs for commit `22a0e05` succeeded:

| Workflow | Event | Result |
|---|---|---|
| Python Catalog CI | push, pull_request | success |
| PowerShell Engine CI | push, pull_request | success |
| Security (gitleaks, pip-audit) | pull_request | success |

**The Day 4 corrections have not been validated by remote CI yet.** The same commands, run locally with GitHub's `pwsh` wrapper, pass, and failures propagate as non-zero exit codes.

### Cross-platform

| Platform | Evidence |
|---|---|
| Windows | Local run: everything above. |
| Linux | Remote CI: the Python suite on `ubuntu-latest` for `22a0e05`. |
| macOS | **No execution.** Dependencies resolve to binary wheels for `macosx_11_0_arm64` and `macosx_10_13_x86_64` (pip dry run), and the API code has no Windows-specific imports. This is static evidence only. |

## Known limitations

- No real install or uninstall evidence. The Windows Sandbox run failed while bootstrapping WinGet (`0x80073CF3`), before the lifecycle test started.
- No macOS execution; no macOS CI job.
- winget: no timeout, the executable path is not verified, the exit-code table is not mapped (a "restart required" code is reported as `Failed`), and a pinned version is not compared during detection.
- The engine matches IDs case-insensitively; the API does not.
- Elevation is recorded, not enforced.
- `tools/Test-DeployForgeLifecycle.ps1` with `-AllowRealInstall` relies only on detection to decide what it installed, so a missed detection could uninstall a pre-existing application. Use it only in Windows Sandbox.
- The API has no authentication, and Uvicorn's access log records query strings.
- CI: no job timeouts, actions pinned by tag, Pester and PSScriptAnalyzer versions not pinned, `tools/` not analysed, and every commit runs on both push and pull request.

## Reproduce

```powershell
python -m pytest tests/python backend/tests -v -W error::DeprecationWarning
python tools/validate_catalog.py
Invoke-Pester -Path tests/powershell -Output Detailed
Invoke-ScriptAnalyzer -Path src -Recurse -Settings ./PSScriptAnalyzerSettings.psd1
Invoke-DeployForgeDeployment -Id google-chrome -WhatIf
```

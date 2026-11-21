# Architecture

This page describes the architecture as implemented. Planned components are listed separately at the end.

## Components

```text
                    packages/catalog.json  (21 applications, metadata only)
                               │
            validated against catalog/schema/catalog.schema.json
                               │
        ┌──────────────────────┼────────────────────────────┐
        ▼                      ▼                            ▼
 tools/validate_catalog.py   backend/app (FastAPI)       src/powershell/DeployForge
 CLI, used by CI             read-only REST API          deployment engine (Windows)
        └───── share backend/app/core/catalog_validation.py │
                                                            ▼
                                     plan ─► detect ─► winget install/uninstall ─► detect ─► log
```

| Component | Location | Platforms | Responsibility |
|---|---|---|---|
| Catalog | `packages/catalog.json` | any | Application metadata: `id`, `name`, `version`, `source` (`winget`, `msstore`, `direct`, `local`), `deployment` (`powershell`, `psadt`, `entry_point`). No installers. |
| Schema | `catalog/schema/catalog.schema.json` | any | JSON Schema Draft 2020-12 for the catalog. |
| Validator | `tools/validate_catalog.py` | any | Schema check plus unique IDs. Exit codes: `0` valid, `1` invalid, `2` missing, unreadable, or malformed file. |
| REST API | `backend/app/` | any | Read-only catalog API (`/health`, `/api/v1/applications`, `/api/v1/applications/{application_id}`). Reads and validates the catalog on every request. See [api-reference.md](api-reference.md). |
| Engine | `src/powershell/DeployForge/` | PowerShell 7.2+; execution on Windows only | Builds plans and installs or uninstalls applications with WinGet, with detection before and after each action and one log per operation. |
| Lifecycle tooling | `tools/Test-DeployForgeLifecycle.ps1`, `tools/sandbox/` | Windows only | Manual install, reinstall, uninstall, uninstall cycle with evidence, intended for Windows Sandbox. Not run in CI. |
| CI | `.github/workflows/` | — | Python tests, Pester and PSScriptAnalyzer, gitleaks and pip-audit. |

## Boundaries

- The API and the engine are independent. The API never imports the engine or runs any command; the engine does not call the API.
- The API and the validator share one validation module. The engine reads the catalog JSON directly and applies its own checks to the values that become command arguments or file paths.
- The engine executes only through one private function (`Invoke-DeployForgeWinget`), which runs nothing outside Windows.

## Engine flow

1. `Get-DeployForgeApplication` reads the catalog and finds the application by `id`.
2. `Get-DeployForgeDeploymentPlan` validates the catalog values and builds the winget arguments. `direct` and `local` sources are reported as unsupported.
3. `Invoke-DeployForgeDeployment` asks for confirmation, creates the log, records whether the session is elevated, detects the current state with `winget list`, runs `winget install` or `winget uninstall` only if needed, detects again, and returns a `DeployForge.DeploymentResult`.

PSADT `entry_point` scripts are metadata only: the engine never runs them.

## Planned, not implemented

- Deployment requests through the API, with authentication and a job-status store.
- Microsoft Graph, Intune, and Configuration Manager integration.
- PSAppDeployToolkit packages and the `direct` and `local` sources.
- Endpoint remediation scripts.
- Upgrades.

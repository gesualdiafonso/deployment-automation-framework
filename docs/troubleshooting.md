# Troubleshooting

Problems you can hit with the current components, and what they mean. Messages come from this repository's code unless the row names another source (Uvicorn, PowerShell).

## Catalog validator

| Exit code / message | Meaning | What to do |
|---|---|---|
| `0` `Catalog validation passed: N application(s).` | Valid. | — |
| `1` `Catalog validation failed:` followed by a list | The catalog breaks the schema or has a duplicate `id`. Each line gives the JSON path of the problem. | Fix the listed entries in `packages/catalog.json`. |
| `2` `ERROR: File not found` | The catalog or schema file is missing. | Run from a complete checkout. |
| `2` `ERROR: Invalid JSON at line L, column C` | The JSON cannot be parsed. | Fix the syntax at that position. |
| `2` `ERROR: Could not parse file` | The file is not UTF-8, or is nested too deeply to parse. | Save it as UTF-8; check for corrupted content. |
| `2` `ERROR: Invalid JSON Schema` | The schema file itself is invalid. | Restore `catalog/schema/catalog.schema.json`. |

## REST API

| Symptom | Meaning | What to do |
|---|---|---|
| `422` `{"detail": "Invalid request parameter: application_id."}` | The ID does not match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, for example `Google.Chrome` (a `package_id`, not an `id`). | Use the catalog `id`, such as `google-chrome`. |
| `404` `{"detail": "Application '<id>' not found."}` | Well-formed ID that is not in the catalog. | List IDs with `GET /api/v1/applications`. |
| `500` `{"detail": "The application catalog is unavailable."}` | The catalog or schema is missing, unreadable, malformed, invalid, or has duplicate IDs. | Read the server log (`ERROR app.core.exceptions: Catalog error ...`) and run `python tools/validate_catalog.py`. |
| `500` `{"detail": "Internal server error."}` | Unexpected server error, or a response outside the API's own contract. | Read the server log for the cause. |
| Uvicorn: `ERROR: [Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000)` | Something, often another API instance, already listens on port 8000. | Stop the other instance, or add `--port 8001`. |
| `/docs` or `/redoc` shows a blank page | They load JavaScript and CSS from a public CDN. | Check internet access; `/openapi.json` works offline. |
| PowerShell: `Activate.ps1 cannot be loaded because running scripts is disabled on this system` | Execution policy. | Use `.\.venv\Scripts\python.exe` directly instead of activating. |

## DeployForge engine

Every operation returns a `DeployForge.DeploymentResult`. When `Status` is `Failed`, `Message` gives the cause and `LogPath` points to the operation log under `logs/`.

| Message or error | Meaning | What to do |
|---|---|---|
| `Application '<id>' was not found in the catalog.` | Unknown ID. Nothing ran. | Check `Get-DeployForgeApplication`. |
| `Application ID '<id>' appears N times in the catalog` | Duplicate `id`. Nothing ran. | Run `python tools/validate_catalog.py` and fix the catalog. |
| `... must be a non-empty string.` or `... contains unsupported characters` | A catalog value is not safe to pass to winget. Nothing ran. | Fix the catalog entry. |
| `Cannot deploy '<id>': Source type '...' is not supported by the engine yet.` | `direct` and `local` sources are not implemented. | — |
| `Could not write the DeployForge log ...` (status `Failed`) | The log directory cannot be created or written. winget was not run. | Fix permissions or pass another `-LogDirectory`. |
| `winget was not found on this machine.` | WinGet (App Installer) is not installed or not on `PATH`. | Install App Installer. |
| `winget is only available on Windows.` | Execution was attempted on macOS or Linux. | Use `-WhatIf` there; run real deployments on Windows. |
| `winget install failed with exit code N.` | winget returned an error. Any non-zero code is treated as a failure, including codes that mean "restart required". | Read the `winget:` lines in the log. Check `Session elevated:`: machine-wide installers may need an elevated session. |
| `winget reported success but verification failed` | winget exited with `0` but detection does not show the expected state. | Run `winget list --id <package_id> --exact` and compare. |
| `winget list failed with exit code N.` | Detection itself failed; no action was taken. | Run `winget list` manually to see the error. |
| PowerShell: `The module '...DeployForge.psd1' requires a minimum Windows PowerShell version of '7.2' to run` | Windows PowerShell 5.1 was used. | Use PowerShell 7.2 or later (`pwsh`). |

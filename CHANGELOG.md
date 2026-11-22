# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Read-only FastAPI catalog API v0.1.0: `GET /health`,
  `GET /api/v1/applications`, `GET /api/v1/applications/{application_id}`,
  with strict response models, `422` for malformed IDs, `404` for unknown
  ones, and generic `500` errors without internal details.
- Validation module shared by the API and `tools/validate_catalog.py`.
- DeployForge engine: install and uninstall through WinGet (`winget` and
  `msstore` sources), detection before and after each action, structured
  results, and one log per operation.
- Manual lifecycle test tooling for Windows Sandbox
  (`tools/Test-DeployForgeLifecycle.ps1`, `tools/sandbox/`).
- Line-ending normalisation via `.gitattributes`.
- Secret scanning configuration (`.gitleaks.toml`) and a `Security` workflow
  (gitleaks and pip-audit).
- Dependabot configuration for Python and GitHub Actions dependencies.
- Pull request template.
- Web frontend (React, TypeScript, Vite) with dashboard, catalog, API explorer
  and deployment center, using only real API data.
- Deployment interface: `GET /api/v1/deployment/status`, `POST /api/v1/deployment/preview`,
  `POST/GET /api/v1/deployment/operations`, `GET /api/v1/deployment/operations/{id}`,
  `POST /api/v1/deployment/operations/{id}/cancel`, with single-use confirmation tokens,
  origin and CSRF checks, a JSON operation registry and an audit log. The API never
  executes processes.
- Agent interface (`/api/v1/agent/heartbeat`, `/operations/claim`, `/operations/{id}/result`)
  and the local PowerShell agent `src/powershell/DeployForgeAgent` (dry run and detect by
  default; real execution only with `DEPLOYFORGE_AGENT_ALLOW_EXECUTE=1`).
- Engine: `Get-DeployForgeApplicationState`, a read-only detection function (module 0.5.0).
- `GET /api/v1/deployment/audit`: read-only audit records with allow-listed fields.
- Frontend: Logs & activity page and System & diagnostics page.

### Changed
- The engine records in each operation log whether the session is elevated.
- API errors are logged with a timestamp, level, and logger name.
- Python CI runs the full suite (`tests/python` and `backend/tests`) with
  deprecation warnings treated as errors.

### Fixed
- The engine no longer runs winget when its operation log cannot be written:
  the operation ends as `Failed`.
- The engine rejects catalogs with duplicate application IDs, and catalog
  values that are not plain strings, instead of building a plan with
  corrupted arguments.
- Unexpected API errors and deeply nested catalog JSON now return the
  documented JSON `500` body instead of a plain-text response.
- `tools/validate_catalog.py` exits with `2` (not `1` with a traceback) for
  catalogs that are not UTF-8 or are nested too deeply to parse.

### Documentation
- README and API reference describe the implemented API and the setup on
  Windows, macOS, and Linux.
- `docs/security.md`, `docs/architecture.md`, and `docs/troubleshooting.md`
  rewritten to match the implementation.
- Day 4 validation evidence in `docs/evidence/day-4-validation.md`.
- `docs/deployment-agent.md`: deployment interface, agent, states and threat model.

> v0.1.0 has not been released.

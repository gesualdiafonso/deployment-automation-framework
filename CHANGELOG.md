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

> v0.1.0 has not been released.

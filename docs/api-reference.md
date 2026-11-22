# DeployForge API Reference

DeployForge API **v0.1.0** is a REST API over the DeployForge application catalog. This page covers the read-only catalog endpoints; the deployment and agent endpoints are documented in [deployment-agent.md](deployment-agent.md). It is implemented with FastAPI in [`backend/app/`](../backend/app/).

| Property | Value |
|---|---|
| Base URL (local) | `http://127.0.0.1:8000` |
| API prefix | `/api/v1` (the health check is outside it) |
| Methods | `GET` only |
| Content type | `application/json` |
| Authentication | None in this version, so run it only on a local machine or in a lab |
| Data source | [`packages/catalog.json`](../packages/catalog.json), validated against [`catalog/schema/catalog.schema.json`](../catalog/schema/catalog.schema.json) |

The API only reads the catalog. It never runs WinGet, PowerShell, or any installation, and it has no endpoints that create, change, or delete data.

## Contents

- [Running the API locally](#running-the-api-locally)
- [Endpoints](#endpoints)
  - [GET /health](#get-health)
  - [GET /api/v1/applications](#get-apiv1applications)
  - [GET /api/v1/applications/{application_id}](#get-apiv1applicationsapplication_id)
- [The application_id rule](#the-application_id-rule)
- [Data models](#data-models)
- [Errors](#errors)
- [Interactive documentation and OpenAPI](#interactive-documentation-and-openapi)
- [Not in this version](#not-in-this-version)

## Running the API locally

Requires Python 3.12 on Windows, macOS, or Linux. The API never runs WinGet or PowerShell, so it has no Windows-specific requirements. Run these commands from the repository root.

Windows (PowerShell):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload
```

macOS or Linux:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload
```

The API listens on `http://127.0.0.1:8000`. `--reload` restarts the server when the code changes; omit it outside development. Stop the server with `Ctrl+C`.

The catalog is read and validated again on **every request**. Changes to `packages/catalog.json` show up on the next request without restarting the server, and an invalid catalog makes requests fail with `500` rather than return unvalidated data.

## Endpoints

| Method | Path | Success | Errors |
|---|---|---|---|
| `GET` | [`/health`](#get-health) | `200` | none |
| `GET` | [`/api/v1/applications`](#get-apiv1applications) | `200` | `500` |
| `GET` | [`/api/v1/applications/{application_id}`](#get-apiv1applicationsapplication_id) | `200` | `404`, `422`, `500` |

None of the endpoints take query parameters or a request body. Unknown query parameters are ignored: `/api/v1/applications?limit=1` still returns every application.

### GET /health

Reports that the API process is running and which version it is. It does not read the catalog, so it returns `200` even when the catalog is broken.

**Response `200 OK`**

```json
{"status": "ok", "service": "DeployForge API", "version": "0.1.0"}
```

| Field | Type | Value |
|---|---|---|
| `status` | string | Always `"ok"` |
| `service` | string | `"DeployForge API"` |
| `version` | string | API version, currently `"0.1.0"` |

**Example**

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

### GET /api/v1/applications

Returns every application in the catalog, in catalog order, together with the count. There is no pagination or filtering.

**Response `200 OK`**: an [`ApplicationListResponse`](#applicationlistresponse). The catalog currently has 21 applications; only the first two are shown here:

```json
{
  "applications": [
    {
      "id": "google-chrome",
      "name": "Google Chrome",
      "version": "latest",
      "source": {"type": "winget", "package_id": "Google.Chrome"},
      "deployment": {"type": "psadt", "entry_point": "packages/browsers/google-chrome/Deploy-Application.ps1"}
    },
    {
      "id": "mozilla-firefox",
      "name": "Mozilla Firefox",
      "version": "latest",
      "source": {"type": "winget", "package_id": "Mozilla.Firefox"},
      "deployment": {"type": "psadt", "entry_point": "packages/browsers/mozilla-firefox/Deploy-Application.ps1"}
    }
  ],
  "total": 21
}
```

**Errors**

| Status | When |
|---|---|
| `500` | The catalog cannot be loaded or is invalid (see [Errors](#errors)) |

**Example**

```powershell
$result = Invoke-RestMethod http://127.0.0.1:8000/api/v1/applications
$result.total
$result.applications | Select-Object id, name
```

### GET /api/v1/applications/{application_id}

Returns one application by its catalog `id`.

**Path parameter**

| Name | Type | Required | Rule |
|---|---|---|---|
| `application_id` | string | Yes | Must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (see [the application_id rule](#the-application_id-rule)) |

The lookup uses the catalog `id` only, never `source.package_id`: `/api/v1/applications/google-chrome` finds Google Chrome, and `/api/v1/applications/Google.Chrome` is rejected with `422`.

**Response `200 OK`**: an [`ApplicationResponse`](#applicationresponse), returned exactly as stored in the catalog. `GET /api/v1/applications/whatsapp`:

```json
{
  "id": "whatsapp",
  "name": "WhatsApp",
  "version": "latest",
  "source": {"type": "msstore", "package_id": "9NKSQGP7F2NH"},
  "deployment": {"type": "powershell", "entry_point": "packages/communication/whatsapp/Deploy-Application.ps1"}
}
```

**Errors**

| Status | When | Body |
|---|---|---|
| `404` | `application_id` is well formed but not in the catalog | `{"detail": "Application 'application-inexistente' not found."}` |
| `422` | `application_id` does not match the ID rule | `{"detail": "Invalid request parameter: application_id."}` |
| `500` | The catalog cannot be loaded or is invalid | `{"detail": "The application catalog is unavailable."}` |

The ID format is checked before the catalog is read, so a malformed ID always returns `422`, even when the catalog itself is broken.

**Examples**

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/applications/google-chrome
```

`Invoke-RestMethod` throws on `4xx` and `5xx` responses. To see the status code and the error body, use `curl.exe` on Windows (or `curl` on macOS and Linux):

```powershell
curl.exe -i http://127.0.0.1:8000/api/v1/applications/application-inexistente   # 404
curl.exe -i http://127.0.0.1:8000/api/v1/applications/Google.Chrome             # 422
```

## The application_id rule

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

The ID is one or more groups of lowercase ASCII letters and digits, joined by single hyphens. This is the same pattern the catalog JSON Schema uses for `id`, and the test suite fails if the two drift apart.

| `application_id` | Status | Reason |
|---|---|---|
| `google-chrome` | `200` | Valid and in the catalog |
| `7zip` | `200` | Digits are allowed anywhere |
| `application-inexistente` | `404` | Valid, but not in the catalog |
| `a` | `404` | Valid (one character is enough), but not in the catalog |
| `Google.Chrome` | `422` | Uppercase letters and `.` (this is the `package_id`, not the `id`) |
| `GOOGLE-CHROME` | `422` | Uppercase letters |
| `google_chrome` | `422` | `_` is not allowed |
| `-x`, `google-` | `422` | Leading or trailing hyphen |
| `a--b` | `422` | Consecutive hyphens |
| `google%20chrome` | `422` | Spaces and other characters are not allowed |

An empty ID never reaches this endpoint. `/api/v1/applications/`, with the trailing slash, is redirected (`307`) to [`/api/v1/applications`](#get-apiv1applications).

## Data models

All models are strict. They contain exactly the fields listed, and the API never adds other fields. The same models appear in the generated OpenAPI document under `components.schemas`.

### ApplicationListResponse

| Field | Type | Rule |
|---|---|---|
| `applications` | array of [`ApplicationResponse`](#applicationresponse) | Catalog order |
| `total` | integer | `>= 0`, always equal to the number of items in `applications` |

### ApplicationResponse

| Field | Type | Rule |
|---|---|---|
| `id` | string | Matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`; unique in the catalog |
| `name` | string | Display name, not empty |
| `version` | string | Matches `^[A-Za-z0-9][A-Za-z0-9._+-]*$`; `latest` in the current catalog |
| `source` | [`ApplicationSource`](#applicationsource) | Where the package comes from |
| `deployment` | [`ApplicationDeployment`](#applicationdeployment) | How it is deployed |

### ApplicationSource

| Field | Type | Rule |
|---|---|---|
| `type` | string | One of `winget`, `msstore`, `direct`, `local` |
| `package_id` | string | Matches `^[A-Za-z0-9][A-Za-z0-9._+-]*$`; the identifier in the source (for example the WinGet ID `Google.Chrome` or the Store ID `9NKSQGP7F2NH`) |

### ApplicationDeployment

| Field | Type | Rule |
|---|---|---|
| `type` | string | One of `powershell`, `psadt` |
| `entry_point` | string | Not empty; a repository-relative path to the deployment script. It is metadata only in this phase: the referenced scripts do not exist yet. |

## Errors

Every error response has the same shape:

```json
{"detail": "<message>"}
```

`detail` is always a single string.

| Status | `detail` | Cause |
|---|---|---|
| `404` | `Application '<id>' not found.` | Well-formed `application_id` that is not in the catalog. `<id>` is the requested ID; it can only contain characters allowed by the ID rule. |
| `422` | `Invalid request parameter: application_id.` | Malformed `application_id` |
| `500` | `The application catalog is unavailable.` | The catalog or schema file is missing or unreadable, the JSON is malformed, the schema is invalid, the catalog breaks the schema, or the catalog has duplicate IDs |
| `500` | `Internal server error.` | The server produced a response outside its own contract, or hit an unexpected internal error |

Error responses never include stack traces, file paths, parser or schema messages, the validation pattern, or the submitted value of a malformed parameter. For a `500`, the technical cause is written to the server log instead.

Responses produced by the framework itself use the same shape:

| Request | Status | Body |
|---|---|---|
| Any method other than `GET` on an API route, such as `POST /api/v1/applications` | `405` | `{"detail": "Method Not Allowed"}`, with header `Allow: GET` |
| A path that does not exist, such as `/api/v1/packages` | `404` | `{"detail": "Not Found"}` |

## Interactive documentation and OpenAPI

While the API is running:

| URL | Content |
|---|---|
| `http://127.0.0.1:8000/docs` | Swagger UI |
| `http://127.0.0.1:8000/redoc` | ReDoc |
| `http://127.0.0.1:8000/openapi.json` | OpenAPI 3.1 document generated from the code |

Swagger UI and ReDoc load their JavaScript and CSS from a public CDN, so the browser needs internet access to render them. `/openapi.json` works offline.

The generated `/openapi.json` is the authoritative contract. If it and this page ever disagree, the generated document wins, and this page should be corrected.

## Not in this version

- Endpoints that create, change, or delete data.
- Deployment requests, and running installations through the API. Installation is done by the DeployForge PowerShell module, not by the API.
- Authentication and authorization.
- Pagination and filtering.
- Microsoft Graph, Intune, or Configuration Manager integration.

See the [README](../README.md) for the project status and roadmap.

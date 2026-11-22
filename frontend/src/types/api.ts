/**
 * Response contracts of the DeployForge API v0.1.0.
 *
 * Mirrors backend/app/schemas/application.py and backend/app/api/routes/health.py.
 * The backend models are strict (extra="forbid"); keep these types in sync with
 * them. A later step replaces this file with types generated from /openapi.json.
 */

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
}

export type ApplicationSourceType = 'winget' | 'msstore' | 'direct' | 'local'
export type ApplicationDeploymentType = 'powershell' | 'psadt'

export interface ApplicationSource {
  type: ApplicationSourceType
  package_id: string
}

export interface ApplicationDeployment {
  type: ApplicationDeploymentType
  entry_point: string
}

export interface Application {
  id: string
  name: string
  version: string
  source: ApplicationSource
  deployment: ApplicationDeployment
}

export interface ApplicationListResponse {
  applications: Application[]
  total: number
}

/** Every API error body: {"detail": "<message>"}. */
export interface ApiErrorBody {
  detail: string
}

/** Same rule as APPLICATION_ID_PATTERN in the backend. */
export const APPLICATION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The only endpoints the API Explorer knows about. Nothing outside this list can
 * be requested: there is no free-form URL, method or header input.
 *
 * Descriptions, parameters and schemas are NOT defined here; they are read from
 * the API's own /openapi.json at runtime.
 */

export type ExplorerMethod = 'GET' | 'POST'

export interface RegisteredEndpoint {
  readonly id: string
  readonly method: ExplorerMethod
  /** OpenAPI path template, e.g. /api/v1/applications/{application_id}. */
  readonly path: string
  /**
   * Whether the Explorer may send this request. Only read-only GETs are
   * executable; anything that could start an operation is display-only.
   */
  readonly executable: boolean
  /** Shown when the endpoint is not executable. */
  readonly note?: string
}

export const REGISTERED_ENDPOINTS: readonly RegisteredEndpoint[] = [
  { id: 'get-health', method: 'GET', path: '/health', executable: true },
  { id: 'list-applications', method: 'GET', path: '/api/v1/applications', executable: true },
  { id: 'get-application', method: 'GET', path: '/api/v1/applications/{application_id}', executable: true },
  { id: 'deployment-status', method: 'GET', path: '/api/v1/deployment/status', executable: true },
  { id: 'list-operations', method: 'GET', path: '/api/v1/deployment/operations', executable: true },
  { id: 'get-operation', method: 'GET', path: '/api/v1/deployment/operations/{operation_id}', executable: true },
  { id: 'audit-log', method: 'GET', path: '/api/v1/deployment/audit', executable: true },
  {
    id: 'preview-operation',
    method: 'POST',
    path: '/api/v1/deployment/preview',
    executable: false,
    note: 'Display only. Previews are requested from Deployments.',
  },
  {
    id: 'create-operation',
    method: 'POST',
    path: '/api/v1/deployment/operations',
    executable: false,
    note: 'Display only. Operations are requested from Deployments, after a confirmation.',
  },
]
// The agent endpoints (/api/v1/agent/*) are deliberately not listed: they are for the local agent only.

/** Path parameter values that would change the path itself instead of filling one segment. */
const UNSAFE_SEGMENTS = new Set(['', '.', '..'])

export type BuildPathResult = { readonly ok: true; readonly path: string } | { readonly ok: false; readonly error: string }

/**
 * Fills the path template of a registered endpoint. Every value is URL-encoded
 * into exactly one segment, so a value can never reach another route.
 */
export function buildRequestPath(
  endpoint: RegisteredEndpoint,
  values: Readonly<Record<string, string>>,
  /** Query parameter names published in OpenAPI; empty values are left out. */
  queryNames: readonly string[] = [],
): BuildPathResult {
  let error: string | null = null
  const path = endpoint.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = (values[name] ?? '').trim()
    if (UNSAFE_SEGMENTS.has(value)) {
      error ??= value === '' ? `${name} is required.` : `"${value}" is not allowed as ${name}.`
      return ''
    }
    return encodeURIComponent(value)
  })
  if (error !== null) return { ok: false, error }
  // URLSearchParams encodes every value, so a query value can never change the path.
  const query = new URLSearchParams()
  for (const name of queryNames) {
    const value = (values[name] ?? '').trim()
    if (value !== '') query.set(name, value)
  }
  const search = query.toString()
  return { ok: true, path: search ? `${path}?${search}` : path }
}

import type { HealthStatus } from '@/lib/status'
import { isApiError } from '@/services/api/api-error'
import type { DeploymentStatus } from '@/types/deployment'

/**
 * Derives the health of each DeployForge component from what the API exposes:
 * GET /health, GET /api/v1/applications and GET /api/v1/deployment/status.
 *
 * Rule: a component without a data source is 'unknown'. Nothing here guesses.
 */

/** Minimal view of a TanStack Query result, so this module stays free of React. */
export interface QueryState {
  readonly isPending: boolean
  readonly isError: boolean
  readonly error: unknown
}

export type ComponentId = 'frontend' | 'api' | 'catalog' | 'agent' | 'engine' | 'winget'

export interface ComponentHealth {
  readonly id: ComponentId
  readonly name: string
  readonly status: HealthStatus
  /** What was observed, or why nothing can be said. */
  readonly detail: string
  /** Where the status comes from. */
  readonly source: string
}

export const AGENT_STATUS_ENDPOINT = 'GET /api/v1/deployment/status'
export const DEPLOYMENT_OPERATIONS_ENDPOINT = 'GET /api/v1/deployment/operations'

/** The API answered, but with an error status (as opposed to not answering at all). */
function apiAnsweredWithError(error: unknown): boolean {
  return isApiError(error) && error.kind === 'http'
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown error.'
}

export function deriveApiHealth(health: QueryState, catalog: QueryState): ComponentHealth {
  const base = { id: 'api', name: 'API', source: 'GET /health' } as const

  if (health.isPending) return { ...base, status: 'checking', detail: 'Connecting…' }
  if (health.isError) {
    // A non-2xx answer means the process is up but unhealthy; anything else means unreachable.
    return apiAnsweredWithError(health.error)
      ? { ...base, status: 'degraded', detail: `Responding with errors: ${errorMessage(health.error)}` }
      : { ...base, status: 'offline', detail: errorMessage(health.error) }
  }
  if (catalog.isError && apiAnsweredWithError(catalog.error)) {
    return { ...base, status: 'degraded', detail: 'Responding, but the catalog is unavailable.' }
  }
  return { ...base, status: 'online', detail: 'Responding' }
}

export function deriveCatalogHealth(catalog: QueryState, applicationTotal: number | undefined): ComponentHealth {
  const base = { id: 'catalog', name: 'Catalog', source: 'GET /api/v1/applications' } as const

  if (catalog.isPending) return { ...base, status: 'checking', detail: 'Loading…' }
  if (catalog.isError) return { ...base, status: 'offline', detail: errorMessage(catalog.error) }
  return {
    ...base,
    status: 'online',
    detail: `${applicationTotal ?? 0} applications, validated`,
  }
}

/** Agent, engine and WinGet health from the agent heartbeat (GET /api/v1/deployment/status). */
export function deriveAgentHealth(
  deployment: QueryState & { readonly data: DeploymentStatus | undefined },
): ComponentHealth[] {
  const source = AGENT_STATUS_ENDPOINT
  const all = (status: HealthStatus, detail: string): ComponentHealth[] => [
    { id: 'agent', name: 'Deployment Agent', status, detail, source },
    { id: 'engine', name: 'PowerShell engine', status, detail, source },
    { id: 'winget', name: 'WinGet', status, detail, source },
  ]
  if (deployment.isPending) return all('checking', 'Connecting…')
  if (deployment.isError || !deployment.data) return all('unknown', 'Status unavailable')

  const { agent } = deployment.data
  if (agent.state === 'never_seen') return all('unknown', 'Agent not started')
  if (agent.state === 'unsupported') return all('unsupported', 'Requires Windows')

  const online = agent.state === 'online'
  const seen = agent.last_heartbeat_at
    ? new Date(agent.last_heartbeat_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'never'
  return [
    {
      id: 'agent',
      name: 'Deployment Agent',
      status: online ? 'online' : 'offline',
      detail: online ? (agent.execute_enabled ? 'Real changes enabled' : 'Dry run and detect only') : `Last seen ${seen}`,
      source,
    },
    {
      id: 'engine',
      name: 'PowerShell engine',
      status: online ? 'online' : 'unknown',
      detail: online
        ? `Version ${agent.engine_version ?? '?'} · PowerShell ${agent.powershell_version ?? '?'}`
        : 'Agent offline',
      source,
    },
    {
      id: 'winget',
      name: 'WinGet',
      status: !online ? 'unknown' : agent.winget?.available ? 'online' : 'offline',
      detail: !online
        ? 'Agent offline'
        : agent.winget?.available
          ? agent.winget.version
            ? `Version ${agent.winget.version.replace(/^v/, '')}`
            : 'Available'
          : 'Not installed',
      source,
    },
  ]
}

export function deriveSystemHealth(
  health: QueryState,
  catalog: QueryState,
  applicationTotal: number | undefined,
  deployment: QueryState & { readonly data: DeploymentStatus | undefined },
): ComponentHealth[] {
  return [
    {
      id: 'frontend',
      name: 'Frontend',
      status: 'online',
      detail: `Version ${__DEPLOYFORGE_UI_VERSION__}`,
      source: 'This page',
    },
    deriveApiHealth(health, catalog),
    deriveCatalogHealth(catalog, applicationTotal),
    ...deriveAgentHealth(deployment),
  ]
}

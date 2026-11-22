import type { StatusKey } from '@/lib/status'
import type { DeploymentStatus } from '@/types/deployment'

export type CapabilityStatus = StatusKey<'capability'>

export interface Capability {
  readonly name: string
  readonly status: CapabilityStatus
  readonly detail: string
}

interface QueryLike<T> {
  readonly isPending: boolean
  readonly isSuccess: boolean
  readonly data: T | undefined
}

/**
 * What can be done right now, from real status data only.
 * 'unsupported' = impossible on this platform (not a failure);
 * 'unavailable' = possible, but a required component is not running;
 * 'disabled'    = possible, switched off by configuration.
 */
export function deriveCapabilities(
  health: QueryLike<unknown>,
  catalog: QueryLike<unknown>,
  deployment: QueryLike<DeploymentStatus>,
): Capability[] {
  const apiUp = health.isSuccess
  const pending = (name: string): Capability => ({ name, status: 'unknown', detail: 'Checking…' })

  const catalogCapability: Capability = catalog.isPending
    ? pending('Browse the catalog')
    : catalog.isSuccess
      ? { name: 'Browse the catalog', status: 'available', detail: 'Ready on any platform' }
      : { name: 'Browse the catalog', status: 'unavailable', detail: 'Catalog not responding' }

  const explorer: Capability = health.isPending
    ? pending('API explorer')
    : apiUp
      ? { name: 'API explorer', status: 'available', detail: 'Read-only requests' }
      : { name: 'API explorer', status: 'unavailable', detail: 'API not reachable' }

  const deploymentNames = ['Detect installation state', 'Dry run (preview)', 'Real install / uninstall'] as const
  let deploymentCapabilities: Capability[]
  const agent = deployment.data?.agent

  if (deployment.isPending) {
    deploymentCapabilities = deploymentNames.map(pending)
  } else if (!deployment.isSuccess || !agent) {
    deploymentCapabilities = deploymentNames.map((name) => ({ name, status: 'unavailable', detail: 'API not reachable' }))
  } else if (agent.state === 'unsupported') {
    deploymentCapabilities = deploymentNames.map((name) => ({
      name,
      status: 'unsupported',
      detail: 'Requires Windows and WinGet',
    }))
  } else if (agent.state !== 'online') {
    const why = agent.state === 'never_seen' ? 'Agent not started' : 'Agent offline'
    deploymentCapabilities = deploymentNames.map((name) => ({ name, status: 'unavailable', detail: why }))
  } else if (!agent.winget?.available) {
    deploymentCapabilities = deploymentNames.map((name) => ({
      name,
      status: 'unavailable',
      detail: 'WinGet not installed',
    }))
  } else {
    deploymentCapabilities = [
      { name: deploymentNames[0], status: 'available', detail: 'Read-only check' },
      { name: deploymentNames[1], status: 'available', detail: 'Nothing is changed' },
      agent.execute_enabled
        ? { name: deploymentNames[2], status: 'available', detail: 'Enabled, with confirmation' }
        : {
            name: deploymentNames[2],
            status: 'disabled',
            detail: 'Off by default (DEPLOYFORGE_AGENT_ALLOW_EXECUTE=1)',
          },
    ]
  }

  return [catalogCapability, explorer, ...deploymentCapabilities]
}

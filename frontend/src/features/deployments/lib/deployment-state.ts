import type { HealthStatus, InstallationStatus } from '@/lib/status'
import type { DeploymentStatus, EngineStatus, Operation } from '@/types/deployment'

export interface KnownInstallation {
  readonly status: InstallationStatus
  /** The operation the status comes from, or null when nothing is known. */
  readonly source: Operation | null
}

/** Real executions whose result the engine confirmed with detection. */
const VERIFIED_STATE: Partial<Record<EngineStatus, InstallationStatus>> = {
  Installed: 'installed',
  AlreadyInstalled: 'installed',
  Uninstalled: 'not_installed',
  NotInstalled: 'not_installed',
}

/**
 * Latest installation state backed by a real detection: a Detect operation, or a
 * real install/uninstall whose outcome the engine verified. Dry runs never count.
 * Operations are newest first (API order).
 */
export function knownInstallation(operations: readonly Operation[], applicationId: string): KnownInstallation {
  for (const operation of operations) {
    if (operation.application_id !== applicationId || operation.state !== 'completed' || !operation.result) continue
    if (operation.action === 'detect' && operation.result.detected_installed !== null) {
      return { status: operation.result.detected_installed ? 'installed' : 'not_installed', source: operation }
    }
    if (operation.mode === 'execute' && operation.result.engine_status) {
      const status = VERIFIED_STATE[operation.result.engine_status]
      if (status) return { status, source: operation }
    }
  }
  return { status: 'unknown', source: null }
}

export function activeOperationFor(operations: readonly Operation[], applicationId: string): Operation | null {
  return (
    operations.find(
      (operation) =>
        operation.application_id === applicationId && (operation.state === 'queued' || operation.state === 'claimed'),
    ) ?? null
  )
}

export interface AgentReadiness {
  readonly health: HealthStatus
  /** Operations (dry run and detect) can be requested. */
  readonly canOperate: boolean
  /** Real install/uninstall can be requested. */
  readonly canExecute: boolean
  /** Why something is not possible, for the UI. */
  readonly reason: string | null
}

export function agentReadiness(status: DeploymentStatus | undefined, apiReachable: boolean): AgentReadiness {
  if (!apiReachable || !status) {
    return { health: apiReachable ? 'checking' : 'offline', canOperate: false, canExecute: false, reason: apiReachable ? null : 'The DeployForge API is not reachable.' }
  }
  const { agent } = status
  switch (agent.state) {
    case 'never_seen':
      return { health: 'offline', canOperate: false, canExecute: false, reason: 'The deployment agent has not connected since the API started.' }
    case 'offline':
      return { health: 'offline', canOperate: false, canExecute: false, reason: 'The deployment agent stopped reporting.' }
    case 'unsupported':
      return {
        health: 'unsupported',
        canOperate: false,
        canExecute: false,
        reason: `Deployments need Windows; the agent runs on ${agent.platform ?? 'another platform'}.`,
      }
    case 'online':
      if (!agent.winget?.available) {
        return { health: 'degraded', canOperate: false, canExecute: false, reason: 'WinGet is not available on the agent machine.' }
      }
      return {
        health: 'online',
        canOperate: true,
        canExecute: agent.execute_enabled === true,
        reason: agent.execute_enabled
          ? null
          : 'Real execution is disabled on the agent: only dry runs and detection are possible.',
      }
  }
}

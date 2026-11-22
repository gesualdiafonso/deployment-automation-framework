import type { DeploymentAction, Operation, OperationState } from '@/types/deployment'

export type ActivitySort = 'newest' | 'oldest' | 'application' | 'duration'

export interface ActivityFilters {
  readonly search: string
  readonly state: OperationState | null
  readonly action: DeploymentAction | null
  readonly sort: ActivitySort
}

/**
 * Seconds between the agent taking the operation and its result, measured by the
 * API from its own timestamps. Null when the operation never ran.
 */
export function durationSeconds(operation: Operation): number | null {
  if (!operation.claimed_at || !operation.finished_at) return null
  const ms = new Date(operation.finished_at).getTime() - new Date(operation.claimed_at).getTime()
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`
}

/** Short error text for the table: the API error, or the engine message when the result failed. */
export function errorSummary(operation: Operation): string | null {
  if (operation.error) return operation.error
  if (operation.state === 'failed' && operation.result?.message) return operation.result.message
  return null
}

export function applyActivityFilters(operations: readonly Operation[], filters: ActivityFilters): Operation[] {
  const needle = filters.search.trim().toLocaleLowerCase()
  const filtered = operations.filter(
    (operation) =>
      (filters.state === null || operation.state === filters.state) &&
      (filters.action === null || operation.action === filters.action) &&
      (needle === '' ||
        [operation.operation_id, operation.application_id, operation.application_name].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        )),
  )
  const byTime = (a: Operation, b: Operation) => a.created_at.localeCompare(b.created_at)
  switch (filters.sort) {
    case 'newest':
      return filtered.sort((a, b) => byTime(b, a))
    case 'oldest':
      return filtered.sort(byTime)
    case 'application':
      return filtered.sort((a, b) => a.application_name.localeCompare(b.application_name) || byTime(b, a))
    case 'duration':
      // Longest first; operations that never ran go last.
      return filtered.sort((a, b) => (durationSeconds(b) ?? -1) - (durationSeconds(a) ?? -1))
  }
}

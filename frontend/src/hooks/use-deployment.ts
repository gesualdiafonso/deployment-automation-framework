import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/services/api/query-keys'
import {
  cancelOperation,
  getAuditLog,
  createOperation,
  getDeploymentStatus,
  getOperation,
  listOperations,
  previewOperation,
} from '@/services/deployment.service'
import { TERMINAL_STATES, type Operation } from '@/types/deployment'

const STATUS_REFRESH_MS = 5_000
const HISTORY_REFRESH_MS = 5_000
const ACTIVE_OPERATION_REFRESH_MS = 1_000

export function useDeploymentStatus() {
  return useQuery({
    queryKey: queryKeys.deployment.status,
    queryFn: ({ signal }) => getDeploymentStatus(signal),
    refetchInterval: STATUS_REFRESH_MS,
    retry: false,
  })
}

export function useOperations(limit = 50) {
  return useQuery({
    queryKey: queryKeys.deployment.operations(limit),
    queryFn: ({ signal }) => listOperations(limit, signal),
    refetchInterval: HISTORY_REFRESH_MS,
  })
}

/** Follows one operation every second until it reaches a final state. */
export function useOperation(operationId: string | null) {
  return useQuery({
    queryKey: queryKeys.deployment.operation(operationId ?? ''),
    queryFn: ({ signal }) => getOperation(operationId as string, signal),
    enabled: operationId !== null,
    refetchInterval: (query) => {
      const data = query.state.data as Operation | undefined
      return data && TERMINAL_STATES.has(data.state) ? false : ACTIVE_OPERATION_REFRESH_MS
    },
  })
}

/** Preview never changes anything; it returns the single-use confirmation token. */
export function usePreview() {
  return useMutation({ mutationFn: previewOperation })
}

export function useCreateOperation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createOperation,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.deployment.all }),
  })
}

export function useCancelOperation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelOperation,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.deployment.all }),
  })
}

/** Audit records, newest first. Pass an operation ID to get the trail of one operation. */
export function useAuditLog(limit = 200, operationId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.deployment.audit(limit, operationId),
    queryFn: ({ signal }) => getAuditLog(limit, operationId, signal),
    enabled,
  })
}

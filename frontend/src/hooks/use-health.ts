import { useMutation, useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/services/api/query-keys'
import { getHealth, testConnection } from '@/services/health.service'

const HEALTH_REFRESH_MS = 30_000

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: HEALTH_REFRESH_MS,
    retry: false,
  })
}

/** Explicit connection test from Settings (never cached). */
export function useConnectionTest() {
  return useMutation({ mutationFn: testConnection })
}

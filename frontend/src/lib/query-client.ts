import { MutationCache, QueryClient } from '@tanstack/react-query'

import { isApiError } from '@/services/api/api-error'

import { notifyError } from './notify'

const MAX_RETRIES = 2

export function createQueryClient(): QueryClient {
  return new QueryClient({
    // Queries show their errors inline; mutations (user actions) also raise a toast.
    mutationCache: new MutationCache({
      onError: (error) => {
        notifyError(error)
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.isClientError) return false
          return failureCount < MAX_RETRIES
        },
      },
      mutations: { retry: false },
    },
  })
}

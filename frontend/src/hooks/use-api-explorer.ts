import { useMutation, useQueries, useQuery } from '@tanstack/react-query'

import {
  DOCUMENTATION_PATHS,
  getOpenApiDocument,
  isDocumentationAvailable,
  sendExplorerGet,
} from '@/services/api-explorer.service'
import { queryKeys } from '@/services/api/query-keys'

export function useOpenApiDocument() {
  return useQuery({
    queryKey: queryKeys.apiExplorer.openapi,
    queryFn: ({ signal }) => getOpenApiDocument(signal),
  })
}

/** Which FastAPI documentation pages the API actually serves. */
export function useDocumentationLinks() {
  return useQueries({
    queries: DOCUMENTATION_PATHS.map((path) => ({
      queryKey: queryKeys.apiExplorer.documentation(path),
      queryFn: ({ signal }: { signal: AbortSignal }) => isDocumentationAvailable(path, signal),
      retry: false,
    })),
  })
}

/** Runs one read-only Explorer request. Not cached: every click is a real request. */
export function useExplorerRequest() {
  return useMutation({
    mutationFn: (path: string) => sendExplorerGet(path),
  })
}

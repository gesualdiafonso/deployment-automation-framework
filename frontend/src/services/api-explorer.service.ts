import type { OpenApiDocument } from '@/types/openapi'

import { request, send, type RawResponse } from './api/http-client'

export function getOpenApiDocument(signal?: AbortSignal): Promise<OpenApiDocument> {
  return request<OpenApiDocument>('/openapi.json', { signal })
}

/**
 * Sends a read-only GET for the API Explorer. Callers pass a path built from a
 * registered endpoint (features/api-explorer/lib/registry.ts); the method is
 * fixed to GET here so the Explorer cannot send anything else.
 */
export function sendExplorerGet(path: string, signal?: AbortSignal): Promise<RawResponse> {
  return send(path, { method: 'GET', signal })
}

/** FastAPI documentation pages the Explorer links to, when the API serves them. */
export const DOCUMENTATION_PATHS = ['/docs', '/redoc', '/openapi.json'] as const
export type DocumentationPath = (typeof DOCUMENTATION_PATHS)[number]

/** Whether the API serves a documentation page (HTTP 200). */
export async function isDocumentationAvailable(path: DocumentationPath, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await send(path, { method: 'GET', signal })
    return response.status === 200
  } catch {
    return false
  }
}

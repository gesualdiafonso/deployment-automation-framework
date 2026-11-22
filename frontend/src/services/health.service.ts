import type { HealthResponse } from '@/types/api'

import { request, send, type RawResponse } from './api/http-client'

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', { signal })
}

/** Connection test: one GET /health with status and timing, including error statuses. */
export function testConnection(): Promise<RawResponse> {
  return send('/health')
}

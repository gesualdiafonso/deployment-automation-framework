import type { HealthResponse } from '@/types/api'

import { request } from './api/http-client'

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', { signal })
}

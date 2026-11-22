import type { Application, ApplicationListResponse } from '@/types/api'

import { request } from './api/http-client'

const BASE_PATH = '/api/v1/applications'

export function listApplications(signal?: AbortSignal): Promise<ApplicationListResponse> {
  return request<ApplicationListResponse>(BASE_PATH, { signal })
}

export function getApplication(applicationId: string, signal?: AbortSignal): Promise<Application> {
  return request<Application>(`${BASE_PATH}/${encodeURIComponent(applicationId)}`, { signal })
}

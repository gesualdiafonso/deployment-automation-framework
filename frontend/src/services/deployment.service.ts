import type {
  AuditLogResponse,
  DeploymentStatus,
  Operation,
  OperationCreateRequest,
  OperationListResponse,
  PreviewRequest,
  PreviewResponse,
} from '@/types/deployment'

import { request } from './api/http-client'

const BASE_PATH = '/api/v1/deployment'

/**
 * Required on every state-changing call. The API refuses writes without it, so a
 * cross-site form or script cannot request a deployment (see backend core/security.py).
 */
const WRITE_HEADERS = { 'X-DeployForge-Request': '1' } as const

export function getDeploymentStatus(signal?: AbortSignal): Promise<DeploymentStatus> {
  return request<DeploymentStatus>(`${BASE_PATH}/status`, { signal })
}

export function previewOperation(body: PreviewRequest): Promise<PreviewResponse> {
  return request<PreviewResponse>(`${BASE_PATH}/preview`, { method: 'POST', body, headers: WRITE_HEADERS })
}

export function createOperation(body: OperationCreateRequest): Promise<Operation> {
  return request<Operation>(`${BASE_PATH}/operations`, { method: 'POST', body, headers: WRITE_HEADERS })
}

export function cancelOperation(operationId: string): Promise<Operation> {
  return request<Operation>(`${BASE_PATH}/operations/${encodeURIComponent(operationId)}/cancel`, {
    method: 'POST',
    headers: WRITE_HEADERS,
  })
}

export function listOperations(limit: number, signal?: AbortSignal): Promise<OperationListResponse> {
  return request<OperationListResponse>(`${BASE_PATH}/operations?limit=${limit}`, { signal })
}

export function getOperation(operationId: string, signal?: AbortSignal): Promise<Operation> {
  return request<Operation>(`${BASE_PATH}/operations/${encodeURIComponent(operationId)}`, { signal })
}

export function getAuditLog(limit: number, operationId: string | null, signal?: AbortSignal): Promise<AuditLogResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (operationId) params.set('operation_id', operationId)
  return request<AuditLogResponse>(`${BASE_PATH}/audit?${params.toString()}`, { signal })
}

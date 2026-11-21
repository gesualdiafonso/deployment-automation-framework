import { getConfig } from '@/lib/env'
import type { ApiErrorBody } from '@/types/api'

import { ApiError } from './api-error'

/**
 * The only place in the frontend that calls fetch(). Components never call it:
 * they use hooks, hooks use services, services use this client.
 */

export type HttpMethod = 'GET' | 'POST'

export interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

export function buildApiUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`API paths must start with "/": ${path}`)
  }
  return `${getConfig().apiBaseUrl}${path}`
}

const GATEWAY_STATUSES = new Set([502, 503, 504])

function isJsonResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('application/json')
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).detail === 'string'
  )
}

async function readJson(response: Response, path: string): Promise<unknown> {
  if (!isJsonResponse(response)) {
    throw new ApiError(
      'invalid_response',
      'The server did not return JSON. Is the DeployForge API running?',
      path,
      response.status,
    )
  }
  try {
    return await response.json()
  } catch {
    throw new ApiError('invalid_response', 'The server returned malformed JSON.', path, response.status)
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, headers = {} } = options
  const timeoutSignal = AbortSignal.timeout(getConfig().apiTimeoutMs)
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  let response: Response
  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combinedSignal,
    })
  } catch (error) {
    // A caller abort (e.g. TanStack Query cancelling a stale request) is not an API error.
    if (signal?.aborted) throw error
    if (timeoutSignal.aborted) {
      throw new ApiError('timeout', 'The DeployForge API did not respond in time.', path)
    }
    throw new ApiError('network', 'The DeployForge API could not be reached.', path)
  }

  if (!response.ok) {
    // A gateway answering for the API (the Vite dev proxy, a reverse proxy) means the API itself is down.
    if (GATEWAY_STATUSES.has(response.status) && !isJsonResponse(response)) {
      throw new ApiError(
        'network',
        `The DeployForge API could not be reached (HTTP ${response.status} from the proxy).`,
        path,
        response.status,
      )
    }
    let detail = `Request failed with status ${response.status}.`
    try {
      const payload = await readJson(response, path)
      if (isApiErrorBody(payload)) detail = payload.detail
    } catch {
      // Keep the generic message: the status is what matters here.
    }
    throw new ApiError('http', detail, path, response.status)
  }

  return (await readJson(response, path)) as T
}

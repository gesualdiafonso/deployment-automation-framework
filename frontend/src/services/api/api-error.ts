export type ApiErrorKind =
  /** The API answered with a non-2xx status. */
  | 'http'
  /** The API could not be reached (offline, refused, CORS, DNS). */
  | 'network'
  /** No answer within VITE_API_TIMEOUT_MS. */
  | 'timeout'
  /** The answer was not the JSON the API contract promises. */
  | 'invalid_response'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly path: string

  constructor(kind: ApiErrorKind, message: string, path: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.path = path
  }

  /** Client errors are deterministic: retrying them will not help. */
  get isClientError(): boolean {
    return this.kind === 'http' && this.status !== null && this.status >= 400 && this.status < 500
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

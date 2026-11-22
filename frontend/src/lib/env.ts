/**
 * Runtime configuration, read once from Vite env variables (VITE_*).
 * Backend URLs live only in .env files; nothing else in src/ may contain one.
 */

export interface AppConfig {
  /** '' means same origin (Vite proxy in development). No trailing slash. */
  readonly apiBaseUrl: string
  readonly apiTimeoutMs: number
  readonly mode: string
  readonly isDevelopment: boolean
}

export type ConfigResult =
  | { readonly ok: true; readonly config: AppConfig }
  | { readonly ok: false; readonly errors: readonly string[] }

function parseApiBaseUrl(raw: string | undefined, errors: string[]): string {
  const value = (raw ?? '').trim()
  if (value === '') return ''

  let url: URL
  try {
    url = new URL(value)
  } catch {
    errors.push('VITE_API_BASE_URL must be empty or an absolute http(s) URL.')
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    errors.push('VITE_API_BASE_URL must use http or https.')
    return ''
  }
  if (url.search || url.hash) {
    errors.push('VITE_API_BASE_URL must not contain a query string or fragment.')
    return ''
  }
  return value.replace(/\/+$/, '')
}

function parseTimeout(raw: string | undefined, errors: string[]): number {
  const value = Number((raw ?? '').trim())
  if (!Number.isInteger(value) || value <= 0) {
    errors.push('VITE_API_TIMEOUT_MS must be a positive integer.')
    return 0
  }
  return value
}

export function parseConfig(env: ImportMetaEnv): ConfigResult {
  const errors: string[] = []
  const apiBaseUrl = parseApiBaseUrl(env.VITE_API_BASE_URL, errors)
  const apiTimeoutMs = parseTimeout(env.VITE_API_TIMEOUT_MS, errors)

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    config: Object.freeze({
      apiBaseUrl,
      apiTimeoutMs,
      mode: env.MODE,
      isDevelopment: env.DEV,
    }),
  }
}

export const configResult: ConfigResult = parseConfig(import.meta.env)

/** The validated configuration. main.tsx refuses to start the app when it is invalid. */
export function getConfig(): AppConfig {
  if (!configResult.ok) {
    throw new Error(`Invalid frontend configuration: ${configResult.errors.join(' ')}`)
  }
  return configResult.config
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** True when the URL points at this machine (127.0.0.1, localhost or [::1]). */
export function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Where API requests actually go: VITE_API_BASE_URL, or this page's own origin
 * when it is empty (development proxy).
 */
export function effectiveApiOrigin(config: AppConfig = getConfig()): string {
  return config.apiBaseUrl || window.location.origin
}

/**
 * Deployments run on the machine of the API's agent, so they are only offered
 * when the API is local. A remote API URL still allows read-only browsing.
 */
export function deploymentsAllowed(config: AppConfig = getConfig()): boolean {
  return isLoopbackUrl(effectiveApiOrigin(config))
}

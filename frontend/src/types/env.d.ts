/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute http(s) base URL of the DeployForge API, or empty for same origin. */
  readonly VITE_API_BASE_URL?: string
  /** Request timeout in milliseconds (positive integer). */
  readonly VITE_API_TIMEOUT_MS?: string
  /** Development only: target of the Vite dev-server proxy (read by vite.config.ts). */
  readonly VITE_DEV_API_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

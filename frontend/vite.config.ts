import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import packageJson from './package.json' with { type: 'json' }

// Backend URLs come from env files, never from source code.
// In development the browser calls same-origin paths (/api, /health) and the
// Vite dev server proxies them to VITE_DEV_API_PROXY_TARGET, so the FastAPI
// backend needs no CORS configuration for local development.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET

  return {
    plugins: [react(), tailwindcss()],
    define: { __DEPLOYFORGE_UI_VERSION__: JSON.stringify(packageJson.version) },
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: proxyTarget
        ? {
            // Trailing slash on purpose: '/api' alone would also capture the /api-explorer page.
            '/api/': { target: proxyTarget, changeOrigin: true },
            '/health': { target: proxyTarget, changeOrigin: true },
            // FastAPI documentation, linked from the API Explorer.
            '/openapi.json': { target: proxyTarget, changeOrigin: true },
            '/docs': { target: proxyTarget, changeOrigin: true },
            '/redoc': { target: proxyTarget, changeOrigin: true },
          }
        : undefined,
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    build: { outDir: 'dist' },
  }
})

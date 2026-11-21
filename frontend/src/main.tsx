import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/styles/globals.css'

import { App } from '@/app/App'
import { ConfigErrorScreen } from '@/app/ConfigErrorScreen'
import { configResult } from '@/lib/env'
import { applyTheme, getSystemTheme, readStoredTheme, resolveTheme } from '@/lib/theme'

// Apply the saved theme before the first render to avoid a light/dark flash.
applyTheme(resolveTheme(readStoredTheme(), getSystemTheme()))

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found in index.html.')

createRoot(rootElement).render(
  <StrictMode>{configResult.ok ? <App /> : <ConfigErrorScreen errors={configResult.errors} />}</StrictMode>,
)

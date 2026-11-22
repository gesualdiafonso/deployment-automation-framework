import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

import {
  applyTheme,
  getSystemTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  subscribeToSystemTheme,
  type Theme,
} from '@/lib/theme'

import { ThemeContext } from './theme-context'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme)
  const resolvedTheme = resolveTheme(theme, systemTheme)

  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next)
    setThemeState(next)
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])

  return <ThemeContext value={value}>{children}</ThemeContext>
}

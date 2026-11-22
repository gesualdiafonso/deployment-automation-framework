import { useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { AppErrorFallback } from '@/components/feedback/AppErrorFallback'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { createQueryClient } from '@/lib/query-client'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

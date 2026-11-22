import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useLocation } from 'react-router'

import { getErrorMessage } from '@/lib/errors'

import { ErrorState } from './ErrorState'

/**
 * Contains a render error to the current page: the sidebar and header keep
 * working, and navigating to another route resets the boundary.
 */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary
      resetKeys={[pathname]}
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorState
          title="This page failed to render"
          message={getErrorMessage(error)}
          onRetry={resetErrorBoundary}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

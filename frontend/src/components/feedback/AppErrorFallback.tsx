import type { FallbackProps } from 'react-error-boundary'

import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'

/** Last-resort screen when the app shell itself fails to render. */
export function AppErrorFallback({ error }: FallbackProps) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div role="alert" className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">DeployForge stopped unexpectedly</h1>
        <p className="text-sm text-muted-foreground">{getErrorMessage(error)}</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </main>
  )
}

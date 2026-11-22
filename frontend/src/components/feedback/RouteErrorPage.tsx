import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import { buttonVariants } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import { paths } from '@/routes/paths'

/** errorElement of the router: errors thrown while matching or loading routes. */
export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : getErrorMessage(error)

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div role="alert" className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Navigation error</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link to={paths.dashboard} className={buttonVariants({ variant: 'outline' })}>
          Back to dashboard
        </Link>
      </div>
    </main>
  )
}

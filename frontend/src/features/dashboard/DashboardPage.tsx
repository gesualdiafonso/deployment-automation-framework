import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplications } from '@/hooks/use-applications'
import { useHealth } from '@/hooks/use-health'
import { getErrorMessage } from '@/lib/errors'

import { SourceTypeChart } from './components/SourceTypeChart'
import { countBySource } from './lib/count-by-source'

export default function DashboardPage() {
  const health = useHealth()
  const applications = useApplications()

  return (
    <div>
      <PageHeader title="Dashboard" description="Live state of the DeployForge API and application catalog." />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>API</CardDescription>
            <CardTitle className="text-2xl">
              {health.isPending ? <Skeleton className="h-7 w-24" /> : health.isError ? 'Offline' : 'Online'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {health.isError ? (
              <ErrorState message={getErrorMessage(health.error)} onRetry={() => void health.refetch()} />
            ) : health.data ? (
              <span>
                {health.data.service} <Badge variant="secondary">v{health.data.version}</Badge>
              </span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Catalog applications</CardDescription>
            <CardTitle className="text-2xl">
              {applications.isPending ? (
                <Skeleton className="h-7 w-12" />
              ) : applications.isError ? (
                '—'
              ) : (
                applications.data.total
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {applications.isError ? (
              <ErrorState message={getErrorMessage(applications.error)} onRetry={() => void applications.refetch()} />
            ) : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Applications by source</CardTitle>
            <CardDescription>From GET /api/v1/applications</CardDescription>
          </CardHeader>
          <CardContent>
            {applications.isPending ? (
              <Skeleton className="h-56 w-full" />
            ) : applications.isError ? (
              <p className="text-sm text-muted-foreground">Catalog unavailable.</p>
            ) : (
              <SourceTypeChart data={countBySource(applications.data.applications)} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

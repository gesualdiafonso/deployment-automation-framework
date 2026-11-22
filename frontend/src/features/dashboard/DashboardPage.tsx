import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, RotateCw } from 'lucide-react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { knownInstallation } from '@/features/deployments/lib/deployment-state'
import { useApplications } from '@/hooks/use-applications'
import { useDeploymentStatus, useOperations } from '@/hooks/use-deployment'
import { useHealth } from '@/hooks/use-health'
import { getErrorMessage } from '@/lib/errors'
import { paths } from '@/routes/paths'
import type { Operation } from '@/types/deployment'

import { HealthGrid } from './components/HealthGrid'
import { MetricTile, type MetricValue } from './components/MetricTile'
import { SourceTypeChart } from './components/SourceTypeChart'
import { countBySource } from './lib/count-by-source'
import { deriveApiHealth, deriveSystemHealth } from './lib/system-health'

/** The registry keeps at most 500 operations; read them all for the metrics. */
const METRICS_OPERATION_LIMIT = 500

// The interface is in English, so dates are too (avoids mixed-language text).
const today = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' })

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (seconds < 60) return format.format(-seconds, 'second')
  if (seconds < 3600) return format.format(-Math.round(seconds / 60), 'minute')
  if (seconds < 86400) return format.format(-Math.round(seconds / 3600), 'hour')
  return format.format(-Math.round(seconds / 86400), 'day')
}

function describe(operation: Operation): string {
  if (operation.action === 'detect') return 'Detect'
  const action = operation.action === 'install' ? 'Install' : 'Uninstall'
  return operation.mode === 'execute' ? action : `${action} · dry run`
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-[13px] font-normal text-primary hover:underline">
      {children}
      <ChevronRight className="size-3.5" aria-hidden />
    </Link>
  )
}

export default function DashboardPage() {
  const health = useHealth()
  const applications = useApplications()
  const deployment = useDeploymentStatus()
  const operations = useOperations(METRICS_OPERATION_LIMIT)
  const [dateLabel] = useState(() => today.format(new Date()))

  // When the API comes back after an outage, reload the catalog instead of keeping its stale error.
  const { isError: catalogFailed, refetch: refetchCatalog } = applications
  useEffect(() => {
    if (health.isSuccess && catalogFailed) void refetchCatalog()
  }, [health.isSuccess, health.dataUpdatedAt, catalogFailed, refetchCatalog])

  const applicationTotal = applications.isSuccess ? applications.data.total : undefined
  const components = deriveSystemHealth(health, applications, applicationTotal, deployment)
  const api = deriveApiHealth(health, applications)
  const agent = deployment.data?.agent
  const operationList = operations.data?.operations ?? []

  const isRefreshing = health.isFetching || applications.isFetching || deployment.isFetching || operations.isFetching
  const refresh = () => {
    void Promise.all([health.refetch(), applications.refetch(), deployment.refetch(), operations.refetch()])
  }

  const catalogMetric: MetricValue = applications.isPending
    ? { state: 'loading' }
    : applications.isError
      ? { state: 'unavailable', reason: 'Catalog unavailable' }
      : { state: 'ready', value: applications.data.total }

  // Installation counts come only from real detections (Detect, or a verified real install/uninstall).
  const counts = (() => {
    if (!applications.isSuccess || !operations.isSuccess) return null
    const result = { installed: 0, not_installed: 0, unknown: 0 }
    for (const app of applications.data.applications) result[knownInstallation(operationList, app.id).status] += 1
    return result
  })()
  const installedMetric: MetricValue =
    applications.isPending || operations.isPending
      ? { state: 'loading' }
      : counts
        ? { state: 'ready', value: counts.installed }
        : { state: 'unavailable', reason: 'No detection data' }

  const inProgress = operationList.filter((op) => op.state === 'queued' || op.state === 'claimed').length
  const failed = operationList.filter((op) => op.state === 'failed' || op.state === 'lost').length
  const operationsMetric: MetricValue = operations.isPending
    ? { state: 'loading' }
    : operations.isError
      ? { state: 'unavailable', reason: 'History unavailable' }
      : { state: 'ready', value: operationList.length }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={dateLabel}
        actions={
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isRefreshing}>
            <RotateCw aria-hidden className={isRefreshing ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        }
      />

      {api.status === 'offline' ? (
        <ErrorState
          title="Can't connect to DeployForge"
          message="Start the API with: python -m uvicorn app.main:app --app-dir backend"
          onRetry={refresh}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricTile label="Applications" metric={catalogMetric} caption="In the catalog" />
        <MetricTile
          label="Installed"
          metric={installedMetric}
          caption={counts ? `${counts.not_installed} not installed · ${counts.unknown} not checked` : undefined}
        />
        <MetricTile
          label="Operations"
          metric={operationsMetric}
          caption={operations.isSuccess ? `${inProgress} in progress · ${failed} failed` : undefined}
        />
        <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-5 shadow-card dark:ring-1 dark:ring-white/[0.04]">
          <span className="text-[13px] font-medium text-muted-foreground">Agent</span>
          {deployment.isPending ? (
            <Skeleton className="h-9 w-24 rounded-lg" />
          ) : (
            <span className="text-[28px] leading-[34px] font-semibold tracking-tight">
              {agent?.state === 'online' ? 'Online' : agent?.state === 'unsupported' ? 'Unsupported' : 'Offline'}
            </span>
          )}
          <span className="min-h-4 text-[12px] text-muted-foreground">
            {agent?.state === 'online'
              ? agent.execute_enabled
                ? 'Real changes enabled'
                : 'Dry run and detect only'
              : agent?.state === 'never_seen'
                ? 'Not started'
                : agent?.last_heartbeat_at
                  ? `Last seen ${relativeTime(agent.last_heartbeat_at)}`
                  : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>System</CardTitle>
          </CardHeader>
          <CardContent>
            <HealthGrid components={components} />
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader className="grid-cols-[1fr_auto] items-center">
              <CardTitle>Catalog by source</CardTitle>
              <SectionLink to={paths.catalog}>Catalog</SectionLink>
            </CardHeader>
            <CardContent>
              {applications.isPending ? (
                <Skeleton className="h-52 w-full rounded-xl" />
              ) : applications.isError ? (
                <ErrorState
                  title="Catalog unavailable"
                  message={getErrorMessage(applications.error)}
                  onRetry={() => void applications.refetch()}
                />
              ) : (
                <SourceTypeChart data={countBySource(applications.data.applications)} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="grid-cols-[1fr_auto] items-center">
              <CardTitle>Recent activity</CardTitle>
              <SectionLink to={paths.activity}>See all</SectionLink>
            </CardHeader>
            <CardContent>
              {operations.isPending ? (
                <Skeleton className="h-28 w-full rounded-xl" />
              ) : operations.isError ? (
                <p className="text-[13px] text-muted-foreground">Activity unavailable.</p>
              ) : operationList.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {operationList.slice(0, 5).map((operation) => (
                    <li key={operation.operation_id}>
                      <Link
                        to={`${paths.activity}?operation=${operation.operation_id}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium">{operation.application_name}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {describe(operation)} · {relativeTime(operation.created_at)}
                          </p>
                        </div>
                        <StatusBadge domain="deploymentRequest" value={operation.state} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

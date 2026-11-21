import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useHealth } from '@/hooks/use-health'
import { getConfig } from '@/lib/env'
import { getErrorMessage } from '@/lib/errors'
import { buildApiUrl } from '@/services/api/http-client'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono break-all">{value}</dd>
    </div>
  )
}

export default function DiagnosticsPage() {
  const config = getConfig()
  const health = useHealth()

  return (
    <div className="space-y-4">
      <PageHeader title="Diagnostics" description="Frontend configuration and API connectivity." />

      <Card>
        <CardHeader>
          <CardTitle>Frontend configuration</CardTitle>
          <CardDescription>Resolved from VITE_* environment variables at build time.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Mode" value={config.mode} />
            <Row label="API base URL" value={config.apiBaseUrl || '(same origin)'} />
            <Row label="Health endpoint" value={buildApiUrl('/health')} />
            <Row label="Request timeout" value={`${config.apiTimeoutMs} ms`} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API health</CardTitle>
          <CardDescription>GET /health, refreshed every 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          {health.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : health.isError ? (
            <ErrorState message={getErrorMessage(health.error)} onRetry={() => void health.refetch()} />
          ) : (
            <dl className="divide-y">
              <Row label="Status" value={health.data.status} />
              <Row label="Service" value={health.data.service} />
              <Row label="Version" value={health.data.version} />
              <Row label="Checked at" value={new Date(health.dataUpdatedAt).toLocaleString()} />
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

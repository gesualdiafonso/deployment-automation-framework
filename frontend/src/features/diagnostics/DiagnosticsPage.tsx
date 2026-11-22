import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useApplications } from '@/hooks/use-applications'
import { useDeploymentStatus } from '@/hooks/use-deployment'
import { useHealth } from '@/hooks/use-health'
import { getConfig } from '@/lib/env'
import { getErrorMessage } from '@/lib/errors'
import { buildApiUrl } from '@/services/api/http-client'
import type { DeploymentStatus } from '@/types/deployment'

import { deriveCapabilities } from './lib/capabilities'

const NOT_EXPOSED = 'Not exposed by the API'

function Row({ label, value, source }: { label: string; value: ReactNode; source: string }) {
  return (
    <div className="grid gap-1 py-2 text-sm sm:grid-cols-[12rem_1fr_14rem] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-break-word">{value}</dd>
      <dd className="font-mono text-[11px] text-muted-foreground sm:text-right">{source}</dd>
    </div>
  )
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground italic">{children}</span>
}

function agentValue(status: DeploymentStatus | undefined, pick: (agent: DeploymentStatus['agent']) => ReactNode): ReactNode {
  const agent = status?.agent
  if (!agent || agent.state === 'never_seen') return <Missing>Not reported (agent not connected)</Missing>
  const value = pick(agent) ?? <Missing>Not reported</Missing>
  if (agent.state !== 'offline') return value
  // Heartbeat data outlives the agent: say it is the last known value, not the current one.
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="opacity-70">{value}</span>
      <span className="text-xs text-muted-foreground">last reported; agent offline</span>
    </span>
  )
}

export default function DiagnosticsPage() {
  const config = getConfig()
  const health = useHealth()
  const applications = useApplications()
  const deployment = useDeploymentStatus()
  const agent = deployment.data?.agent
  const capabilities = deriveCapabilities(health, applications, deployment)

  const isFetching = health.isFetching || applications.isFetching || deployment.isFetching
  const refresh = () => void Promise.all([health.refetch(), applications.refetch(), deployment.refetch()])

  const apiStatus = health.isPending ? 'checking' : health.isSuccess ? 'online' : 'offline'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Diagnostics"
        description="Versions, components and capabilities."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
            <RotateCw aria-hidden className={isFetching ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>System</CardTitle>
          <CardDescription>Each value with the component that reports it.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row
              label="API availability"
              value={
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge domain="health" value={apiStatus} />
                  {health.isError ? <span className="text-xs text-muted-foreground">{getErrorMessage(health.error)}</span> : null}
                </span>
              }
              source="GET /health"
            />
            <Row label="Frontend version" value={<span className="font-mono">{__DEPLOYFORGE_UI_VERSION__}</span>} source="frontend/package.json" />
            <Row
              label="API version"
              value={health.isSuccess ? <span className="font-mono">{health.data.version}</span> : <Missing>Unavailable</Missing>}
              source="GET /health"
            />
            <Row
              label="Engine version"
              value={agentValue(deployment.data, (a) => (a.engine_version ? <span className="font-mono">{a.engine_version}</span> : null))}
              source="agent heartbeat"
            />
            <Row
              label="Operating system (agent)"
              value={agentValue(deployment.data, (a) => a.os_version)}
              source="agent heartbeat"
            />
            <Row label="Operating system (API host)" value={<Missing>{NOT_EXPOSED}</Missing>} source="—" />
            <Row label="Python version" value={<Missing>{NOT_EXPOSED}</Missing>} source="—" />
            <Row
              label="PowerShell"
              value={agentValue(deployment.data, (a) =>
                a.powershell_version ? <span className="font-mono">{a.powershell_version}</span> : null,
              )}
              source="agent heartbeat"
            />
            <Row
              label="WinGet"
              value={agentValue(deployment.data, (a) =>
                a.platform && a.platform !== 'windows' ? (
                  <StatusBadge domain="capability" value="unsupported" />
                ) : a.winget ? (
                  a.winget.available ? (
                    <span className="font-mono">{a.winget.version ?? 'available'}</span>
                  ) : (
                    <StatusBadge domain="capability" value="unavailable" />
                  )
                ) : null,
              )}
              source="agent heartbeat"
            />
            <Row
              label="Agent elevated"
              value={agentValue(deployment.data, (a) => (a.elevated === null ? null : a.elevated ? 'Yes (administrator)' : 'No'))}
              source="agent heartbeat"
            />
            <Row
              label="Catalog validation"
              value={
                applications.isPending ? (
                  <StatusBadge domain="health" value="checking" />
                ) : applications.isSuccess ? (
                  <span>
                    Valid: {applications.data.total} applications. The API validates the catalog against its JSON Schema on
                    every request.
                  </span>
                ) : (
                  <span className="text-destructive">{getErrorMessage(applications.error)}</span>
                )
              }
              source="GET /api/v1/applications"
            />
            <Row
              label="Deployment agent"
              value={
                deployment.isError ? (
                  <Missing>{getErrorMessage(deployment.error)}</Missing>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      domain="health"
                      value={
                        !agent
                          ? 'checking'
                          : agent.state === 'online'
                            ? 'online'
                            : agent.state === 'unsupported'
                              ? 'unsupported'
                              : agent.state === 'offline'
                                ? 'offline'
                                : 'unknown'
                      }
                    />
                    {agent?.last_heartbeat_at ? (
                      <span className="text-xs text-muted-foreground">
                        last heartbeat {new Date(agent.last_heartbeat_at).toLocaleTimeString()}
                      </span>
                    ) : agent?.state === 'never_seen' ? (
                      <span className="text-xs text-muted-foreground">has not connected since the API started</span>
                    ) : null}
                  </span>
                )
              }
              source="GET /api/v1/deployment/status"
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform capabilities</CardTitle>
          <CardDescription>
            "Unsupported" means not possible on this platform (expected). "Unavailable" means possible, but something is not
            running.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-xl bg-card ring-1 ring-border">
            {capabilities.map((capability) => (
              <li key={capability.name} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[14rem_8rem_1fr] sm:items-center sm:gap-3">
                <span className="text-sm font-medium">{capability.name}</span>
                <StatusBadge domain="capability" value={capability.status} />
                <span className="min-w-0 text-xs wrap-anywhere text-muted-foreground">{capability.detail}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frontend configuration</CardTitle>
          <CardDescription>Resolved from VITE_* environment variables at build time.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Mode" value={<span className="font-mono">{config.mode}</span>} source="Vite" />
            <Row label="API base URL" value={<span className="font-mono">{config.apiBaseUrl || '(same origin)'}</span>} source="VITE_API_BASE_URL" />
            <Row label="Health endpoint" value={<span className="font-mono break-all">{buildApiUrl('/health')}</span>} source="derived" />
            <Row label="Request timeout" value={`${config.apiTimeoutMs} ms`} source="VITE_API_TIMEOUT_MS" />
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

import type { ReactNode } from 'react'

import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DeploymentStatus } from '@/types/deployment'

import type { AgentReadiness } from '../lib/deployment-state'

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  )
}

const dash = <span className="text-muted-foreground">—</span>

export function AgentStatusCard({
  status,
  readiness,
  isPending,
}: {
  status: DeploymentStatus | undefined
  readiness: AgentReadiness
  isPending: boolean
}) {
  const agent = status?.agent
  return (
    <Card className="gap-4">
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <div className="space-y-1">
          <CardTitle>Deployment agent</CardTitle>
          <CardDescription>Runs operations on this machine.</CardDescription>
        </div>
        <StatusBadge domain="health" value={readiness.health} />
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Item label="Platform">{agent?.platform ?? dash}</Item>
            <Item label="WinGet">
              {agent?.winget ? (agent.winget.available ? (agent.winget.version ?? 'available') : 'not available') : dash}
            </Item>
            <Item label="PowerShell">{agent?.powershell_version ?? dash}</Item>
            <Item label="Engine">{agent?.engine_version ?? dash}</Item>
            <Item label="Elevated">{agent?.elevated === null || agent?.elevated === undefined ? dash : agent.elevated ? 'yes' : 'no'}</Item>
            <Item label="Real execution">
              {agent?.execute_enabled === null || agent?.execute_enabled === undefined ? (
                dash
              ) : agent.execute_enabled ? (
                <span className="font-medium text-warning">enabled</span>
              ) : (
                'disabled'
              )}
            </Item>
          </dl>
        )}
        {readiness.reason ? <p className="text-sm text-muted-foreground">{readiness.reason}</p> : null}
        {agent && (agent.state === 'never_seen' || agent.state === 'offline') ? (
          <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-xs">
            {'Import-Module ./src/powershell/DeployForgeAgent/DeployForgeAgent.psd1\nStart-DeployForgeAgent'}
          </pre>
        ) : null}
        {status ? (
          <p className="text-xs text-muted-foreground">
            Queue: {status.queue.queued} pending · {status.queue.running} running
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

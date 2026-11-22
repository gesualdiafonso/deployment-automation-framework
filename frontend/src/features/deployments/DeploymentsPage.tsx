import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Download, FlaskConical, Radar, Search, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplications } from '@/hooks/use-applications'
import { useCreateOperation, useDeploymentStatus, useOperations, usePreview } from '@/hooks/use-deployment'
import { getEngineSupport, SOURCE_LABELS } from '@/lib/engine-support'
import { deploymentsAllowed, effectiveApiOrigin } from '@/lib/env'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { Application } from '@/types/api'
import type { ChangeAction, DeploymentMode, Operation, PreviewResponse } from '@/types/deployment'

import { AgentStatusCard } from './components/AgentStatusCard'
import { ConfirmOperationDialog } from './components/ConfirmOperationDialog'
import { OperationDetails } from './components/OperationDetails'
import { OperationHistory } from './components/OperationHistory'
import { activeOperationFor, agentReadiness, knownInstallation } from './lib/deployment-state'

const APP_PARAM = 'app'

function ApplicationPicker({
  applications,
  selectedId,
  onSelect,
}: {
  applications: readonly Application[]
  selectedId: string | null
  onSelect: (applicationId: string) => void
}) {
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search)
  const visible = useMemo(() => {
    const needle = deferred.trim().toLocaleLowerCase()
    return [...applications]
      .filter((app) => needle === '' || app.name.toLocaleLowerCase().includes(needle) || app.id.includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [applications, deferred])

  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">Search applications</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or ID"
          className="h-9 w-full rounded-lg bg-secondary pr-2 pl-8 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      <ul className="max-h-[32rem] space-y-0.5 overflow-y-auto" aria-label="Applications">
        {visible.map((app) => (
          <li key={app.id}>
            <button
              type="button"
              onClick={() => onSelect(app.id)}
              aria-current={app.id === selectedId ? 'true' : undefined}
              className={cn(
                'flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent',
                app.id === selectedId && 'bg-accent font-medium',
              )}
            >
              <span className="text-sm">{app.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{app.id}</span>
            </button>
          </li>
        ))}
        {visible.length === 0 ? <li className="px-2 py-4 text-sm text-muted-foreground">No match.</li> : null}
      </ul>
    </div>
  )
}

export default function DeploymentsPage() {
  if (!deploymentsAllowed()) {
    return (
      <div className="space-y-4">
        <PageHeader title="Deployments" />
        <ErrorState
          title="Deployments are disabled for a remote API"
          message={`The API URL (${effectiveApiOrigin()}) is not on this machine. Installs and uninstalls are only offered through a local API (127.0.0.1, localhost or [::1]). Catalog browsing still works.`}
        />
      </div>
    )
  }
  return <DeploymentCenter />
}

function DeploymentCenter() {
  const applications = useApplications()
  const status = useDeploymentStatus()
  const operations = useOperations()
  const preview = usePreview()
  const create = useCreateOperation()

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get(APP_PARAM)
  const [mode, setMode] = useState<DeploymentMode>('dry_run')
  const [pendingPreview, setPendingPreview] = useState<PreviewResponse | null>(null)
  const [trackedId, setTrackedId] = useState<string | null>(null)
  // Synchronous lock: two clicks in the same frame both run before React re-renders,
  // so disabled buttons alone cannot stop a second request.
  const inFlight = useRef(false)
  const startRequest = (): boolean => {
    if (inFlight.current) return false
    inFlight.current = true
    return true
  }
  const endRequest = () => {
    inFlight.current = false
  }

  const readiness = agentReadiness(status.data, !status.isError)
  const operationList = operations.data?.operations ?? []
  const selected = applications.data?.applications.find((app) => app.id === selectedId) ?? null
  const support = selected ? getEngineSupport(selected.source.type) : null
  const installation = selected ? knownInstallation(operationList, selected.id) : null
  const active = selected ? activeOperationFor(operationList, selected.id) : null
  const effectiveMode: DeploymentMode = readiness.canExecute ? mode : 'dry_run'

  const busy = preview.isPending || create.isPending || pendingPreview !== null
  const canRequest = Boolean(selected && support?.install.supported && readiness.canOperate && !active && !busy)

  const selectApp = (applicationId: string) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.set(APP_PARAM, applicationId)
      return next
    })
  }

  // Step 3 of the flow: ask the API what would happen. Nothing runs until the dialog is confirmed.
  const requestPreview = (application: Application, action: ChangeAction, requestedMode: DeploymentMode) => {
    if (!startRequest()) return
    preview.reset()
    create.reset()
    preview.mutate(
      { application_id: application.id, action, mode: requestedMode },
      { onSuccess: (data) => setPendingPreview(data), onSettled: endRequest },
    )
  }

  const confirm = () => {
    if (!pendingPreview?.confirmation_token || !startRequest()) return
    create.mutate(
      {
        application_id: pendingPreview.application.id,
        action: pendingPreview.action,
        mode: pendingPreview.mode,
        confirmation_token: pendingPreview.confirmation_token,
      },
      {
        onSuccess: (operation) => {
          setPendingPreview(null)
          setTrackedId(operation.operation_id)
        },
        onSettled: endRequest,
      },
    )
  }

  const detect = (application: Application) => {
    if (!startRequest()) return
    create.reset()
    create.mutate(
      { application_id: application.id, action: 'detect' },
      { onSuccess: (operation) => setTrackedId(operation.operation_id), onSettled: endRequest },
    )
  }

  const runAgain = (operation: Operation) => {
    const application = applications.data?.applications.find((app) => app.id === operation.application_id)
    if (!application) return
    selectApp(application.id)
    if (operation.action === 'detect') detect(application)
    else requestPreview(application, operation.action, operation.mode ?? 'dry_run')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deployments"
        description="Install, remove and check applications. Every change is confirmed first."
      />

      {status.isError ? (
        <ErrorState title="Deployment status unavailable" message={getErrorMessage(status.error)} onRetry={() => void status.refetch()} />
      ) : (
        <AgentStatusCard status={status.data} readiness={readiness} isPending={status.isPending} />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle>Applications</CardTitle>
                      </CardHeader>
          <CardContent className="px-4">
            {applications.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : applications.isError ? (
              <ErrorState message={getErrorMessage(applications.error)} onRetry={() => void applications.refetch()} />
            ) : (
              <ApplicationPicker applications={applications.data.applications} selectedId={selectedId} onSelect={selectApp} />
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {!selected ? (
            <Card>
              <CardHeader>
                <CardTitle>Select an application</CardTitle>
                <CardDescription>Choose an application on the left to see its state and the available operations.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card className="gap-4">
              <CardHeader>
                <CardTitle>{selected.name}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-xs">{selected.id}</code>
                  <Badge variant="outline">{SOURCE_LABELS[selected.source.type]}</Badge>
                  <code className="font-mono text-xs">{selected.source.package_id}</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Installation state</dt>
                    <dd className="space-y-1">
                      <StatusBadge domain="installation" value={installation?.status} />
                      <span className="block text-xs text-muted-foreground">
                        {installation?.source
                          ? `From ${installation.source.action === 'detect' ? 'Detect' : 'a verified ' + installation.source.action} at ${new Date(installation.source.finished_at ?? installation.source.created_at).toLocaleString()}`
                          : 'Never detected. Use Detect.'}
                      </span>
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Platform</dt>
                    <dd className="text-sm">
                      {support?.install.supported ? support.platform.join(', ') : 'Not supported by the engine'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Agent</dt>
                    <dd>
                      <StatusBadge domain="health" value={readiness.health} />
                    </dd>
                  </div>
                </dl>

                <fieldset className="space-y-2" disabled={!readiness.canOperate}>
                  <legend className="mb-2 text-xs text-muted-foreground">Mode for install and uninstall</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup">
                    {(['dry_run', 'execute'] as const).map((option) => {
                      const disabled = option === 'execute' && !readiness.canExecute
                      return (
                        <label
                          key={option}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-[13px] ring-1 ring-transparent',
                            effectiveMode === option && (option === 'execute' ? 'bg-destructive/10 text-destructive ring-destructive/30' : 'bg-primary/10 text-primary ring-primary/30'),
                            disabled && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <input
                            type="radio"
                            name="mode"
                            value={option}
                            checked={effectiveMode === option}
                            disabled={disabled}
                            onChange={() => setMode(option)}
                          />
                          {option === 'dry_run' ? 'Dry run (preview, no changes)' : 'Real execution'}
                        </label>
                      )
                    })}
                  </div>
                  {!readiness.canExecute && readiness.canOperate ? (
                    <p className="text-xs text-muted-foreground">
                      Real execution is off: start the agent with DEPLOYFORGE_AGENT_ALLOW_EXECUTE=1 to enable it.
                    </p>
                  ) : null}
                </fieldset>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={!canRequest} onClick={() => detect(selected)}>
                    <Radar aria-hidden />
                    Detect
                  </Button>
                  <Button
                    variant={effectiveMode === 'execute' ? 'default' : 'secondary'}
                    disabled={!canRequest}
                    onClick={() => requestPreview(selected, 'install', effectiveMode)}
                  >
                    {effectiveMode === 'execute' ? <Download aria-hidden /> : <FlaskConical aria-hidden />}
                    {effectiveMode === 'execute' ? 'Install…' : 'Preview install'}
                  </Button>
                  <Button
                    variant={effectiveMode === 'execute' ? 'destructive' : 'secondary'}
                    disabled={!canRequest || !support?.uninstall.supported}
                    onClick={() => requestPreview(selected, 'uninstall', effectiveMode)}
                  >
                    {effectiveMode === 'execute' ? <Trash2 aria-hidden /> : <FlaskConical aria-hidden />}
                    {effectiveMode === 'execute' ? 'Uninstall…' : 'Preview uninstall'}
                  </Button>
                </div>

                {active ? (
                  <p className="text-sm text-muted-foreground">
                    An operation for this application is {active.state === 'queued' ? 'pending' : 'running'}.{' '}
                    <button type="button" className="text-primary hover:underline" onClick={() => setTrackedId(active.operation_id)}>
                      Show it
                    </button>
                  </p>
                ) : null}
                {!readiness.canOperate && readiness.reason ? <p className="text-sm text-muted-foreground">{readiness.reason}</p> : null}
                {preview.isError ? <ErrorState title="Preview failed" message={getErrorMessage(preview.error)} /> : null}
                {create.isError && !pendingPreview ? (
                  <ErrorState title="Request refused" message={getErrorMessage(create.error)} />
                ) : null}
              </CardContent>
            </Card>
          )}

          {trackedId ? (
            <OperationDetails
              key={trackedId}
              operationId={trackedId}
              onClose={() => setTrackedId(null)}
              onRunAgain={runAgain}
            />
          ) : null}
        </div>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Operation history</CardTitle>
          <CardDescription>Latest 50 operations.</CardDescription>
        </CardHeader>
        <CardContent>
          {operations.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : operations.isError ? (
            <ErrorState message={getErrorMessage(operations.error)} onRetry={() => void operations.refetch()} />
          ) : (
            <OperationHistory operations={operationList} selectedId={trackedId} onSelect={setTrackedId} />
          )}
        </CardContent>
      </Card>

      {pendingPreview && selected && installation ? (
        <ConfirmOperationDialog
          key={pendingPreview.confirmation_token ?? 'no-token'}
          preview={pendingPreview}
          installation={installation.status}
          isSubmitting={create.isPending}
          error={create.error}
          onConfirm={confirm}
          onClose={() => {
            setPendingPreview(null)
            create.reset()
          }}
        />
      ) : null}
    </div>
  )
}

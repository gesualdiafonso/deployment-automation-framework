import { useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, RotateCw, X } from 'lucide-react'

import { StatusBadge } from '@/components/StatusBadge'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCancelOperation, useOperation } from '@/hooks/use-deployment'
import { getErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/services/api/query-keys'
import { cn } from '@/lib/utils'
import { TERMINAL_STATES, type Operation } from '@/types/deployment'

const STEPS = [
  { state: 'queued', label: 'Pending' },
  { state: 'claimed', label: 'Running' },
  { state: 'done', label: 'Result' },
] as const

function Steps({ operation }: { operation: Operation }) {
  const current = TERMINAL_STATES.has(operation.state) ? 2 : operation.state === 'claimed' ? 1 : 0
  const reachedRunning = operation.claimed_at !== null
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
      {STEPS.map((step, index) => {
        const skipped = index === 1 && current === 2 && !reachedRunning
        return (
          <li key={step.state} className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full border px-2 py-0.5',
                index < current && !skipped && 'border-success/40 text-success',
                index === current && 'border-primary bg-primary/10 font-medium text-primary',
                (index > current || skipped) && 'text-muted-foreground',
              )}
              aria-current={index === current ? 'step' : undefined}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 ? <span className="text-muted-foreground">→</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-1.5 text-sm sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function time(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—'
}

function actionLabel(operation: Operation): string {
  const action = { install: 'Install', uninstall: 'Uninstall', detect: 'Detect' }[operation.action]
  if (operation.action === 'detect') return `${action} (read-only)`
  return `${action} · ${operation.mode === 'execute' ? 'real execution' : 'dry run'}`
}

interface OperationDetailsProps {
  operationId: string
  onClose: () => void
  /** Starts the same request again through a new preview/confirmation. Never automatic. Omit to hide. */
  onRunAgain?: (operation: Operation) => void
}

export function OperationDetails({ operationId, onClose, onRunAgain }: OperationDetailsProps) {
  const query = useOperation(operationId)
  const cancel = useCancelOperation()
  const operation = query.data
  const queryClient = useQueryClient()
  const finished = operation ? TERMINAL_STATES.has(operation.state) : false

  // When the operation ends, refresh the history and status right away so the
  // application is no longer shown as busy (they otherwise refresh every 5 s).
  useEffect(() => {
    if (finished) void queryClient.invalidateQueries({ queryKey: queryKeys.deployment.all })
  }, [finished, queryClient])

  return (
    <Card className="gap-4" aria-live="polite">
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">
            {operation ? `${operation.application_name}: ${actionLabel(operation)}` : 'Operation'}
          </CardTitle>
          <CardDescription className="font-mono text-xs break-all">{operationId}</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close operation">
          <X aria-hidden />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : operation ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Steps operation={operation} />
              <StatusBadge domain="deploymentRequest" value={operation.state} />
            </div>

            {operation.result ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {operation.result.engine_status ? (
                    <StatusBadge domain="engineResult" value={operation.result.engine_status} />
                  ) : null}
                  {operation.result.detected_installed !== null ? (
                    <StatusBadge
                      domain="installation"
                      value={operation.result.detected_installed ? 'installed' : 'not_installed'}
                    />
                  ) : null}
                </div>
                <p className="text-sm">{operation.result.message}</p>
              </div>
            ) : null}
            {operation.error ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">{operation.error}</p>
            ) : null}

            <dl className="divide-y">
              <Row label="Exit code">
                <span className="font-mono">
                  {operation.result?.exit_code ?? (operation.result ? 'none (winget not run)' : '—')}
                </span>
              </Row>
              <Row label="Verified">
                {operation.result?.verified === null || operation.result?.verified === undefined
                  ? '—'
                  : operation.result.verified
                    ? 'yes, by detection afterwards'
                    : 'no'}
              </Row>
              <Row label="Engine operation">
                <span className="font-mono text-xs">{operation.result?.engine_operation_id ?? '—'}</span>
              </Row>
              <Row label="Engine log">
                <span className="font-mono text-xs">{operation.result?.log_file ?? '—'}</span>
              </Row>
              <Row label="Requested">{time(operation.created_at)}</Row>
              <Row label="Started">{time(operation.claimed_at)}</Row>
              <Row label="Finished">{time(operation.finished_at)}</Row>
            </dl>

            <div className="flex flex-wrap gap-2">
              {operation.state === 'queued' ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (!cancel.isPending && !cancel.isSuccess) cancel.mutate(operation.operation_id)
                  }}
                >
                  <Ban aria-hidden />
                  {cancel.isPending ? 'Cancelling…' : 'Cancel'}
                </Button>
              ) : null}
              {onRunAgain && (operation.state === 'failed' || operation.state === 'expired' || operation.state === 'cancelled') ? (
                <Button variant="outline" size="sm" onClick={() => onRunAgain(operation)}>
                  <RotateCw aria-hidden />
                  {operation.action === 'detect' ? 'Detect again' : 'Start again (new confirmation)'}
                </Button>
              ) : null}
              {operation.state === 'lost' ? (
                <p className="text-sm text-muted-foreground">
                  The outcome is unknown, so retrying is not offered. Run Detect to see the real state first.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

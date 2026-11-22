import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownUp, RotateCw, Search } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { OperationDetails } from '@/features/deployments/components/OperationDetails'
import { useAuditLog, useOperations } from '@/hooks/use-deployment'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { DeploymentAction, Operation, OperationState } from '@/types/deployment'

import { AuditTable } from './components/AuditTable'
import { applyActivityFilters, durationSeconds, errorSummary, formatDuration, type ActivitySort } from './lib/activity-view'

/** The registry keeps at most 500 operations; the page reads all of them. */
const OPERATION_LIMIT = 500
const AUDIT_LIMIT = 500
const TABS = ['operations', 'audit', 'sources'] as const
type Tab = (typeof TABS)[number]

const STATES: readonly OperationState[] = ['queued', 'claimed', 'completed', 'failed', 'cancelled', 'expired', 'lost']
const ACTIONS: readonly DeploymentAction[] = ['install', 'uninstall', 'detect']
const SORTS: Readonly<Record<ActivitySort, string>> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  application: 'Application',
  duration: 'Longest duration',
}

const controlClass =
  'h-9 rounded-lg bg-secondary px-2.5 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function Select<T extends string>({
  label,
  value,
  options,
  format,
  onChange,
  allowAll = true,
}: {
  label: string
  value: T | null
  options: readonly T[]
  format: (value: T) => string
  onChange: (value: T | null) => void
  allowAll?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select
        className={controlClass}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : (event.target.value as T))}
      >
        {allowAll ? <option value="">All</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function OperationsTable({
  operations,
  selectedId,
  onSelect,
}: {
  operations: readonly Operation[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-[12px] text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Operation</th>
            <th scope="col" className="px-3 py-2 font-medium">Application</th>
            <th scope="col" className="px-3 py-2 font-medium">Action</th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Requested</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Exit code</th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Duration</th>
            <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {operations.map((operation) => {
            const error = errorSummary(operation)
            return (
              <tr
                key={operation.operation_id}
                onClick={() => onSelect(operation.operation_id)}
                className={cn('cursor-pointer align-top hover:bg-muted/60', operation.operation_id === selectedId && 'bg-accent hover:bg-accent')}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    title={operation.operation_id}
                    className="font-mono text-xs text-primary hover:underline"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(operation.operation_id)
                    }}
                  >
                    {operation.operation_id.slice(0, 8)}
                  </button>
                </td>
                <td className="px-3 py-2">{operation.application_name}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {operation.action}
                  {operation.mode ? <span className="text-muted-foreground"> · {operation.mode === 'execute' ? 'real' : 'dry run'}</span> : null}
                </td>
                <td className="hidden px-3 py-2 text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                  {new Date(operation.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge domain="deploymentRequest" value={operation.state} />
                </td>
                <td className="hidden px-3 py-2 font-mono text-xs sm:table-cell">{operation.result?.exit_code ?? '—'}</td>
                <td className="hidden px-3 py-2 text-xs whitespace-nowrap sm:table-cell">{formatDuration(durationSeconds(operation))}</td>
                <td className="hidden max-w-72 px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                  <span className="line-clamp-2" title={error ?? undefined}>
                    {error ?? '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SourceRow({ name, location, exposed, children }: { name: string; location: string; exposed: ReactNode; children: ReactNode }) {
  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-medium">{name}</td>
      <td className="px-3 py-2 font-mono text-xs">{location}</td>
      <td className="px-3 py-2 text-xs">{exposed}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{children}</td>
    </tr>
  )
}

function LogSources() {
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-[12px] text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Source</th>
            <th scope="col" className="px-3 py-2 font-medium">Where</th>
            <th scope="col" className="px-3 py-2 font-medium">In this UI</th>
            <th scope="col" className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <SourceRow name="Operation history" location="backend/data/deployment-operations.json" exposed="Operations tab">
            Current state of the last 500 operations (GET /api/v1/deployment/operations). Duration is measured by the API
            between the agent taking the operation and its result.
          </SourceRow>
          <SourceRow name="Audit records" location="logs/audit/deployforge-audit.jsonl" exposed="Audit log tab">
            Append-only record of every request, hand-over and outcome (GET /api/v1/deployment/audit). Fixed fields only; no
            tokens or headers are ever written.
          </SourceRow>
          <SourceRow name="Engine logs" location="logs/<time>-<app>-<action>-<id>.log" exposed="File name only">
            One per real install or uninstall (dry runs create none). Content is not exposed by the API: open the file on the
            agent machine.
          </SourceRow>
          <SourceRow name="Process logs" location="API and agent console (stderr)" exposed="Not exposed">
            Uvicorn access log and app errors, and the agent console. Kept out of the UI: they can contain request paths and
            internal error details.
          </SourceRow>
        </tbody>
      </table>
    </div>
  )
}

export default function ActivityPage() {
  const operations = useOperations(OPERATION_LIMIT)
  const audit = useAuditLog(AUDIT_LIMIT)
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = TABS.find((value) => value === searchParams.get('tab')) ?? 'operations'
  const selectedId = searchParams.get('operation')
  const selectedTrail = useAuditLog(50, selectedId, selectedId !== null)

  const [search, setSearch] = useState('')
  const [state, setState] = useState<OperationState | null>(null)
  const [action, setAction] = useState<DeploymentAction | null>(null)
  const [sort, setSort] = useState<ActivitySort>('newest')
  const deferredSearch = useDeferredValue(search)

  const all = operations.data?.operations
  const visible = useMemo(
    () => (all ? applyActivityFilters(all, { search: deferredSearch, state, action, sort }) : []),
    [all, deferredSearch, state, action, sort],
  )

  const setParam = (key: string, value: string | null) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  const selectOperation = (id: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        next.set('tab', 'operations')
        next.set('operation', id)
        return next
      },
      { replace: true },
    )
  }

  const isFetching = operations.isFetching || audit.isFetching
  const refresh = () => void Promise.all([operations.refetch(), audit.refetch(), selectedId ? selectedTrail.refetch() : null])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity"
        description="Operations and audit history."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
            <RotateCw aria-hidden className={isFetching ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        }
      />

      <div role="tablist" aria-label="Activity views" className="flex gap-1 border-b">
        {(
          [
            ['operations', `Operations${operations.data ? ` (${operations.data.total})` : ''}`],
            ['audit', `Audit log${audit.data ? ` (${audit.data.total})` : ''}`],
            ['sources', 'Log sources'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setParam('tab', value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === value ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'operations' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-56 flex-1">
              <span className="sr-only">Search operations</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by application or operation ID"
                className={`${controlClass} w-full pl-8`}
              />
            </label>
            <Select label="Status" value={state} options={STATES} format={(value) => value} onChange={setState} />
            <Select label="Action" value={action} options={ACTIONS} format={(value) => value} onChange={setAction} />
            <span className="flex items-center gap-1">
              <ArrowDownUp className="size-3.5 text-muted-foreground" aria-hidden />
              <Select
                label="Sort"
                value={sort}
                options={Object.keys(SORTS) as ActivitySort[]}
                format={(value) => SORTS[value]}
                onChange={(value) => setSort(value ?? 'newest')}
                allowAll={false}
              />
            </span>
          </div>

          <div className={cn('grid grid-cols-1 items-start gap-4', selectedId && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]')}>
            <div className="min-w-0">
              {operations.isPending ? (
                <Skeleton className="h-48 w-full" />
              ) : operations.isError ? (
                <ErrorState title="Operation history unavailable" message={getErrorMessage(operations.error)} onRetry={() => void operations.refetch()} />
              ) : operations.data.total === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No operations have been recorded yet.
                </p>
              ) : visible.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No operation matches the search and filters.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {visible.length} of {operations.data.total} operations
                  </p>
                  <OperationsTable operations={visible} selectedId={selectedId} onSelect={selectOperation} />
                </>
              )}
            </div>

            {selectedId ? (
              <div className="min-w-0 space-y-4">
                <OperationDetails key={selectedId} operationId={selectedId} onClose={() => setParam('operation', null)} />
                <Card className="gap-3">
                  <CardHeader>
                    <CardTitle className="text-base">Audit trail</CardTitle>
                    <CardDescription>Every audit record of this operation, newest first.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedTrail.isPending ? (
                      <Skeleton className="h-24 w-full" />
                    ) : selectedTrail.isError ? (
                      <ErrorState message={getErrorMessage(selectedTrail.error)} onRetry={() => void selectedTrail.refetch()} />
                    ) : (
                      <AuditTable records={selectedTrail.data.records} />
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'audit' ? (
        audit.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : audit.isError ? (
          <ErrorState title="Audit log unavailable" message={getErrorMessage(audit.error)} onRetry={() => void audit.refetch()} />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Showing {audit.data.records.length} of {audit.data.total} records, newest first.
              {audit.data.skipped_lines > 0 ? ` ${audit.data.skipped_lines} unreadable line(s) were skipped.` : ''}
              {audit.data.truncated ? ' The log is large: only its last 5 MB were read.' : ''}
            </p>
            <AuditTable records={audit.data.records} onSelectOperation={selectOperation} />
          </div>
        )
      ) : null}

      {tab === 'sources' ? <LogSources /> : null}
    </div>
  )
}

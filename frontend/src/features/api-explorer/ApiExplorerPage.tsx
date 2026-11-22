import { useState } from 'react'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentationLinks, useExplorerRequest, useOpenApiDocument } from '@/hooks/use-api-explorer'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { DOCUMENTATION_PATHS } from '@/services/api-explorer.service'
import { buildApiUrl } from '@/services/api/http-client'

import { EndpointPanel, type ExplorerResult } from './components/EndpointPanel'
import { HttpStatusBadge, MethodBadge } from './components/parts'
import { findOperation } from './lib/openapi'
import { REGISTERED_ENDPOINTS } from './lib/registry'

const SELECTED_PARAM = 'endpoint'

function DocumentationLinks() {
  const results = useDocumentationLinks()
  const available = DOCUMENTATION_PATHS.filter((_, index) => results[index]?.data === true)
  const checking = results.some((result) => result.isPending)

  if (checking) return <Skeleton className="h-5 w-48" />
  if (available.length === 0) return <span className="text-xs text-muted-foreground">API documentation not reachable.</span>
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {available.map((path) => (
        <a
          key={path}
          href={buildApiUrl(path)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
        >
          {path}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ))}
    </div>
  )
}

export default function ApiExplorerPage() {
  const openapi = useOpenApiDocument()
  const execute = useExplorerRequest()
  const [results, setResults] = useState<Record<string, ExplorerResult>>({})
  const [runningId, setRunningId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const requested = searchParams.get(SELECTED_PARAM)
  const selected = REGISTERED_ENDPOINTS.find((endpoint) => endpoint.id === requested) ?? REGISTERED_ENDPOINTS[0]

  const select = (id: string) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        next.set(SELECTED_PARAM, id)
        return next
      },
      { replace: true },
    )

  const run = (endpointId: string, path: string) => {
    setRunningId(endpointId)
    execute.mutate(path, {
      onSuccess: (response) =>
        setResults((current) => ({ ...current, [endpointId]: { kind: 'response', path, response, at: Date.now() } })),
      onError: (error) =>
        setResults((current) => ({ ...current, [endpointId]: { kind: 'error', path, error, at: Date.now() } })),
      onSettled: () => setRunningId(null),
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="API Explorer"
        description={
          openapi.isSuccess
            ? `${openapi.data.info.title} ${openapi.data.info.version} · definitions loaded from /openapi.json (OpenAPI ${openapi.data.openapi})`
            : 'Endpoint definitions are loaded from the API’s /openapi.json.'
        }
        actions={<DocumentationLinks />}
      />

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Read-only requests to the endpoints listed below.
      </p>

      {openapi.isPending ? (
        <div role="status" aria-label="Loading API definitions" className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : openapi.isError ? (
        <ErrorState
          title="Could not load the API definitions"
          message={getErrorMessage(openapi.error)}
          onRetry={() => void openapi.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <nav aria-label="Endpoints" className="rounded-xl border bg-card p-2">
            <ul className="space-y-1">
              {REGISTERED_ENDPOINTS.map((endpoint) => {
                const published = findOperation(openapi.data, endpoint) !== null
                const last = results[endpoint.id]
                const active = endpoint.id === selected.id
                return (
                  <li key={endpoint.id}>
                    <button
                      type="button"
                      onClick={() => select(endpoint.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full flex-col gap-1.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent',
                        active && 'bg-accent',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MethodBadge method={endpoint.method} />
                        <span className="truncate font-mono text-xs" title={endpoint.path}>
                          {endpoint.path}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 pl-14 text-[11px] text-muted-foreground">
                        {published ? (
                          <Badge variant="outline" className="text-success">
                            Available
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not in API</Badge>
                        )}
                        {last?.kind === 'response' ? (
                          <span className="flex items-center gap-1">
                            last <HttpStatusBadge status={last.response.status} /> {last.response.durationMs} ms
                          </span>
                        ) : last?.kind === 'error' ? (
                          <span className="text-destructive">last: no response</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <EndpointPanel
            key={selected.id}
            endpoint={selected}
            document={openapi.data}
            operation={findOperation(openapi.data, selected)}
            result={results[selected.id]}
            isRunning={runningId === selected.id}
            onExecute={(path) => run(selected.id, path)}
          />
        </div>
      )}
    </div>
  )
}

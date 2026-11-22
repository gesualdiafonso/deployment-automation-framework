import { useState } from 'react'
import { Ban, Play } from 'lucide-react'

import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getErrorMessage } from '@/lib/errors'
import type { RawResponse } from '@/services/api/http-client'
import type { OpenApiDocument, OpenApiOperation } from '@/types/openapi'

import { exampleFromSchema, jsonSchemaOf, resolveSchema } from '../lib/openapi'
import { buildRequestPath, type RegisteredEndpoint } from '../lib/registry'
import { HttpStatusBadge, JsonBlock, MethodBadge } from './parts'

export type ExplorerResult =
  | { readonly kind: 'response'; readonly path: string; readonly response: RawResponse; readonly at: number }
  | { readonly kind: 'error'; readonly path: string; readonly error: unknown; readonly at: number }

interface EndpointPanelProps {
  endpoint: RegisteredEndpoint
  document: OpenApiDocument
  operation: OpenApiOperation | null
  result: ExplorerResult | undefined
  isRunning: boolean
  onExecute: (path: string) => void
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
}

export function EndpointPanel({ endpoint, document, operation, result, isRunning, onExecute }: EndpointPanelProps) {
  const parameters = operation?.parameters ?? []
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      parameters.map((parameter) => [parameter.name, String(resolveSchema(document, parameter.schema).examples?.[0] ?? '')]),
    ),
  )
  const queryNames = parameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name)
  const built = buildRequestPath(endpoint, values, queryNames)
  const canExecute = endpoint.executable && operation !== null && endpoint.method === 'GET'

  const successSchema = jsonSchemaOf(operation?.responses?.['200'])
  const requestSchema = jsonSchemaOf(operation?.requestBody)

  return (
    <Card className="gap-5">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={endpoint.method} />
          <CardTitle className="font-mono text-base break-all">{endpoint.path}</CardTitle>
        </div>
        <CardDescription>
          {operation ? (
            <>
              <span className="font-medium text-foreground">{operation.summary}</span>
              {operation.description ? (
                <span className="mt-1 block whitespace-pre-line">{operation.description.replaceAll('``', '`')}</span>
              ) : null}
            </>
          ) : (
            'The API does not publish this endpoint in /openapi.json.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!operation || !endpoint.executable ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {operation ? '' : 'Not available: the endpoint does not exist in the running API. '}
              {endpoint.note ?? ''}
            </span>
          </div>
        ) : null}

        <section className="space-y-2">
          <Heading>Request parameters</Heading>
          {parameters.length === 0 ? (
            <p className="text-sm text-muted-foreground">{operation ? 'None.' : 'Unknown: no published definition.'}</p>
          ) : (
            <div className="space-y-3">
              {parameters.map((parameter) => {
                const schema = resolveSchema(document, parameter.schema)
                return (
                  <label key={parameter.name} className="block space-y-1 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{parameter.name}</span>
                      <Badge variant="outline">{parameter.in}</Badge>
                      {parameter.required ? <Badge variant="secondary">required</Badge> : null}
                      {schema.type ? <span className="text-xs text-muted-foreground">{schema.type}</span> : null}
                    </span>
                    <input
                      value={values[parameter.name] ?? ''}
                      onChange={(event) => setValues((current) => ({ ...current, [parameter.name]: event.target.value }))}
                      maxLength={200}
                      spellCheck={false}
                      autoComplete="off"
                      className="h-9 w-full rounded-lg bg-secondary px-3 font-mono text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                    {parameter.description ? (
                      <span className="block text-xs text-muted-foreground">{parameter.description}</span>
                    ) : null}
                    {schema.pattern ? (
                      <span className="block font-mono text-xs break-all text-muted-foreground">
                        pattern: {schema.pattern}
                      </span>
                    ) : null}
                  </label>
                )
              })}
            </div>
          )}
          {requestSchema ? (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Request body (shape from the OpenAPI schema)</span>
              <JsonBlock value={exampleFromSchema(document, requestSchema)} />
            </div>
          ) : null}
        </section>

        {canExecute ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => built.ok && onExecute(built.path)} disabled={!built.ok || isRunning}>
              <Play aria-hidden />
              {isRunning ? 'Sending…' : 'Send request'}
            </Button>
            {built.ok ? (
              <code className="text-xs break-all text-muted-foreground">GET {built.path}</code>
            ) : (
              <span className="text-xs text-destructive">{built.error}</span>
            )}
          </div>
        ) : null}

        <section className="space-y-2" aria-live="polite">
          <Heading>Last response</Heading>
          {!result ? (
            <p className="text-sm text-muted-foreground">
              {canExecute ? 'Not sent yet in this session.' : 'This endpoint cannot be called from the Explorer.'}
            </p>
          ) : result.kind === 'error' ? (
            <ErrorState title="No response" message={getErrorMessage(result.error)} />
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  Status <HttpStatusBadge status={result.response.status} />
                </span>
                <span>
                  Time <span className="font-mono text-foreground">{result.response.durationMs} ms</span>
                </span>
                <span className="font-mono">{result.response.contentType || 'no content type'}</span>
                <span>at {new Date(result.at).toLocaleTimeString()}</span>
              </div>
              <code className="block text-xs break-all text-muted-foreground">GET {result.path}</code>
              {result.response.json !== null ? (
                <JsonBlock value={result.response.json} />
              ) : (
                <JsonBlock text={result.response.text || '(empty body)'} />
              )}
            </div>
          )}
        </section>

        {operation?.responses ? (
          <section className="space-y-2">
            <Heading>Documented responses</Heading>
            <ul className="divide-y rounded-xl bg-card ring-1 ring-border text-sm">
              {Object.entries(operation.responses).map(([code, response]) => (
                <li key={code} className="flex gap-3 px-3 py-2">
                  <HttpStatusBadge status={Number(code)} />
                  <span className="text-muted-foreground">{response.description}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {successSchema ? (
          <section className="space-y-2">
            <Heading>Example JSON</Heading>
            <p className="text-xs text-muted-foreground">
              Shape of a 200 response, generated from the OpenAPI schema. Values are placeholders, not real data; send
              the request to see the real response.
            </p>
            <JsonBlock value={exampleFromSchema(document, successSchema)} />
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

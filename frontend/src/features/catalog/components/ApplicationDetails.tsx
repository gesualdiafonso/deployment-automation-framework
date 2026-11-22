import { useEffect, useRef, type ReactNode } from 'react'
import { CircleCheck, CircleX, X } from 'lucide-react'

import { StatusBadge } from '@/components/StatusBadge'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplication } from '@/hooks/use-applications'
import { getErrorMessage } from '@/lib/errors'
import { isApiError } from '@/services/api/api-error'
import { APPLICATION_ID_PATTERN, type Application } from '@/types/api'

import { getEngineSupport, isUnpinnedVersion, SOURCE_LABELS, type OperationSupport } from '@/lib/engine-support'

const NOT_IN_CATALOG = 'Not provided by the catalog'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <dl className="divide-y rounded-xl bg-card ring-1 ring-border">{children}</dl>
    </section>
  )
}

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs leading-5 break-all' : 'break-words'}>{children}</dd>
    </div>
  )
}

function Missing() {
  return <span className="text-muted-foreground italic">{NOT_IN_CATALOG}</span>
}

function Operation({ support }: { support: OperationSupport }) {
  const Icon = support.supported ? CircleCheck : CircleX
  return (
    <div className="space-y-1">
      <span className={support.supported ? 'flex items-center gap-1.5 text-success' : 'flex items-center gap-1.5 text-muted-foreground'}>
        <Icon className="size-4" aria-hidden />
        {support.supported ? 'Supported' : 'Not supported'}
      </span>
      <span className="block font-mono text-xs break-words text-muted-foreground">{support.method}</span>
    </div>
  )
}

function DetailsBody({ application }: { application: Application }) {
  const support = getEngineSupport(application.source.type)
  const unpinned = isUnpinnedVersion(application.version)

  return (
    <div className="space-y-5">
      <Section title="Metadata">
        <Field label="Name">{application.name}</Field>
        <Field label="Application ID" mono>
          {application.id}
        </Field>
        <Field label="Version">
          <span className="font-mono text-xs">{application.version}</span>
          {unpinned ? <span className="ml-2 text-xs text-muted-foreground">(no pinned version)</span> : null}
        </Field>
        <Field label="Publisher">
          <Missing />
        </Field>
        <Field label="Category">
          <Missing />
        </Field>
        <Field label="Description">
          <Missing />
        </Field>
      </Section>

      <Section title="Installation">
        <Field label="Source">{SOURCE_LABELS[application.source.type]}</Field>
        <Field label={application.source.type === 'winget' ? 'WinGet package ID' : 'Package ID'} mono>
          {application.source.package_id}
        </Field>
        <Field label="Install">
          <Operation support={support.install} />
        </Field>
        <Field label="Version installed">
          {unpinned ? 'Latest available from the source' : `Pinned to ${application.version}`}
        </Field>
        <Field label="Deployment type" mono>
          {application.deployment.type}
        </Field>
        <Field label="Entry point" mono>
          {application.deployment.entry_point}
          <span className="mt-1 block font-sans break-normal text-muted-foreground">
            Relative to the repository. Catalog metadata only: the engine does not run it.
          </span>
        </Field>
      </Section>

      <Section title="Uninstallation">
        <Field label="Uninstall">
          <Operation support={support.uninstall} />
        </Field>
      </Section>

      <Section title="Compatibility and status">
        <Field label="Platform">
          {support.platform.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {support.platform.map((requirement) => (
                <Badge key={requirement} variant="outline">
                  {requirement}
                </Badge>
              ))}
            </span>
          ) : (
            'No supported platform: the engine cannot deploy this source type.'
          )}
        </Field>
        <Field label="Catalog validation">
          <span className="flex items-center gap-1.5 text-success">
            <CircleCheck className="size-4" aria-hidden />
            Valid
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            The API validates the whole catalog against its JSON Schema on every request and refuses to serve an
            invalid one.
          </span>
        </Field>
        <Field label="Installation status">
          <StatusBadge domain="health" value="unknown" />
          <span className="mt-1 block text-xs text-muted-foreground">
            Run Detect in Deployments to check.
          </span>
        </Field>
      </Section>

      <p className="text-xs text-muted-foreground">
        Install and remove applications from Deployments.
      </p>
    </div>
  )
}

interface ApplicationDetailsProps {
  applicationId: string
  onClose: () => void
}

/** Details of one application, fetched from GET /api/v1/applications/{application_id}. */
export function ApplicationDetails({ applicationId, onClose }: ApplicationDetailsProps) {
  const isValidId = APPLICATION_ID_PATTERN.test(applicationId)
  const query = useApplication(applicationId)
  const panelRef = useRef<HTMLDivElement>(null)

  // Below the xl breakpoint the panel sits under the table: bring it into view when the selection changes.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 80rem)').matches) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [applicationId])

  let body: ReactNode
  if (!isValidId) {
    body = <ErrorState title="Invalid application ID" message={`"${applicationId}" is not a valid catalog ID.`} />
  } else if (query.isPending) {
    body = (
      <div role="status" aria-label="Loading application" className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  } else if (query.isError) {
    const notFound = isApiError(query.error) && query.error.status === 404
    body = (
      <ErrorState
        title={notFound ? 'Application not found' : 'Could not load the application'}
        message={getErrorMessage(query.error)}
        onRetry={notFound ? undefined : () => void query.refetch()}
      />
    )
  } else {
    body = <DetailsBody application={query.data} />
  }

  return (
    <Card ref={panelRef} aria-label="Application details" className="scroll-mt-4 gap-4">
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">{query.data?.name ?? 'Application details'}</CardTitle>
          <CardDescription className="font-mono text-xs break-all">
            GET /api/v1/applications/{applicationId}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details">
          <X aria-hidden />
        </Button>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

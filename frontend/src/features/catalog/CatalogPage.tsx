import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { PackageSearch, RotateCw, Search } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplications } from '@/hooks/use-applications'
import { getErrorMessage } from '@/lib/errors'
import type { ApplicationDeploymentType, ApplicationSourceType } from '@/types/api'

import { ApplicationDetails } from './components/ApplicationDetails'
import { CatalogTable } from './components/CatalogTable'
import { applyCatalogView, distinctValues, type SortDirection } from './lib/catalog-view'
import { SOURCE_LABELS } from '@/lib/engine-support'

/** The selected application lives in the URL (?app=<id>) so details can be linked and survive a reload. */
const SELECTED_PARAM = 'app'

const selectClass =
  'h-9 rounded-lg bg-secondary px-2.5 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function FilterSelect<T extends string>({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string
  value: T | null
  options: readonly T[]
  format: (value: T) => string
  onChange: (value: T | null) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select
        className={selectClass}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : (event.target.value as T))}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {format(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}

export default function CatalogPage() {
  const applications = useApplications()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get(SELECTED_PARAM)

  const [search, setSearch] = useState('')
  const [sourceType, setSourceType] = useState<ApplicationSourceType | null>(null)
  const [deploymentType, setDeploymentType] = useState<ApplicationDeploymentType | null>(null)
  const [sort, setSort] = useState<SortDirection>('asc')
  const deferredSearch = useDeferredValue(search)

  const all = applications.data?.applications
  const visible = useMemo(
    () => (all ? applyCatalogView(all, { search: deferredSearch, sourceType, deploymentType, sort }) : []),
    [all, deferredSearch, sourceType, deploymentType, sort],
  )
  const sourceOptions = useMemo(() => (all ? distinctValues(all, (a) => a.source.type) : []), [all])
  const deploymentOptions = useMemo(() => (all ? distinctValues(all, (a) => a.deployment.type) : []), [all])

  const hasFilters = search !== '' || sourceType !== null || deploymentType !== null
  const clearFilters = () => {
    setSearch('')
    setSourceType(null)
    setDeploymentType(null)
  }
  const select = (applicationId: string | null) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (applicationId) next.set(SELECTED_PARAM, applicationId)
        else next.delete(SELECTED_PARAM)
        return next
      },
      { replace: true },
    )
  }

  let content: ReactNode
  if (applications.isPending) {
    content = (
      <div role="status" aria-label="Loading catalog" className="space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    )
  } else if (applications.isError) {
    content = (
      <ErrorState
        title="The catalog could not be loaded"
        message={getErrorMessage(applications.error)}
        onRetry={() => void applications.refetch()}
      />
    )
  } else if (applications.data.total === 0) {
    content = <EmptyState>The catalog has no applications.</EmptyState>
  } else if (visible.length === 0) {
    content = (
      <EmptyState
        action={
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      >
        No application matches the current search and filters.
      </EmptyState>
    )
  } else {
    content = (
      <CatalogTable
        applications={visible}
        selectedId={selectedId}
        sort={sort}
        onToggleSort={() => setSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
        onSelect={select}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catalog"
        description="Applications available to deploy."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void applications.refetch()}
            disabled={applications.isFetching}
          >
            <RotateCw aria-hidden className={applications.isFetching ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search applications</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, ID or package ID"
            className={`${selectClass} w-full pl-8`}
            disabled={!all}
          />
        </label>
        <FilterSelect
          label="Source"
          value={sourceType}
          options={sourceOptions}
          format={(value) => SOURCE_LABELS[value]}
          onChange={setSourceType}
        />
        <FilterSelect
          label="Deployment"
          value={deploymentType}
          options={deploymentOptions}
          format={(value) => value}
          onChange={setDeploymentType}
        />
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {applications.isSuccess ? `${visible.length} of ${applications.data.total} applications` : ' '}
        </span>
      </div>

      <div
        className={`grid grid-cols-1 items-start gap-4 ${selectedId !== null ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]' : ''}`}
      >
        <div className="min-w-0">{content}</div>
        {selectedId !== null ? (
          <div className="min-w-0 xl:sticky xl:top-4">
            <ApplicationDetails applicationId={selectedId} onClose={() => select(null)} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

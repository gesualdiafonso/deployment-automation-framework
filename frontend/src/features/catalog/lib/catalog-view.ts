import type { Application, ApplicationDeploymentType, ApplicationSourceType } from '@/types/api'

export type SortDirection = 'asc' | 'desc'

export interface CatalogViewOptions {
  readonly search: string
  /** null = every source type. */
  readonly sourceType: ApplicationSourceType | null
  /** null = every deployment type. */
  readonly deploymentType: ApplicationDeploymentType | null
  readonly sort: SortDirection
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** Case- and accent-insensitive match on name, catalog ID or package ID. */
function matchesSearch(application: Application, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase()
  if (needle === '') return true
  return [application.name, application.id, application.source.package_id].some((value) =>
    value.toLocaleLowerCase().includes(needle),
  )
}

/** Filters and sorts the catalog returned by the API. Never adds or changes entries. */
export function applyCatalogView(applications: readonly Application[], options: CatalogViewOptions): Application[] {
  const direction = options.sort === 'asc' ? 1 : -1
  return applications
    .filter(
      (application) =>
        matchesSearch(application, options.search) &&
        (options.sourceType === null || application.source.type === options.sourceType) &&
        (options.deploymentType === null || application.deployment.type === options.deploymentType),
    )
    .sort((a, b) => direction * collator.compare(a.name, b.name) || collator.compare(a.id, b.id))
}

/** Distinct values present in the catalog, so filters only offer options that match something. */
export function distinctValues<T extends string>(applications: readonly Application[], pick: (a: Application) => T): T[] {
  return [...new Set(applications.map(pick))].sort((a, b) => collator.compare(a, b))
}

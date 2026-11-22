import type { Application, ApplicationSourceType } from '@/types/api'

export interface SourceCount {
  source: ApplicationSourceType
  count: number
}

const SOURCE_ORDER: readonly ApplicationSourceType[] = ['winget', 'msstore', 'direct', 'local']

/** Number of catalog applications per source type, in a stable order, zero counts omitted. */
export function countBySource(applications: readonly Application[]): SourceCount[] {
  return SOURCE_ORDER.map((source) => ({
    source,
    count: applications.filter((application) => application.source.type === source).length,
  })).filter((entry) => entry.count > 0)
}

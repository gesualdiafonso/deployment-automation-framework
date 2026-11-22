import { ArrowDownAZ, ArrowUpAZ, ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Application } from '@/types/api'

import { SOURCE_LABELS } from '@/lib/engine-support'
import type { SortDirection } from '../lib/catalog-view'

interface CatalogTableProps {
  applications: readonly Application[]
  selectedId: string | null
  sort: SortDirection
  onToggleSort: () => void
  onSelect: (applicationId: string) => void
}

export function CatalogTable({ applications, selectedId, sort, onToggleSort, onSelect }: CatalogTableProps) {
  const SortIcon = sort === 'asc' ? ArrowDownAZ : ArrowUpAZ

  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-[12px] text-muted-foreground">
          <tr>
            <th scope="col" aria-sort={sort === 'asc' ? 'ascending' : 'descending'} className="px-3 py-2 font-medium">
              <button
                type="button"
                onClick={onToggleSort}
                className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                title={`Sorted by name, ${sort === 'asc' ? 'A to Z' : 'Z to A'}. Click to reverse.`}
              >
                Name
                <SortIcon className="size-3.5" aria-hidden />
              </button>
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
              Package ID
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Source
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
              Version
            </th>
            <th scope="col" className="w-8 px-2 py-2">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {applications.map((application) => {
            const selected = application.id === selectedId
            return (
              <tr
                key={application.id}
                onClick={() => onSelect(application.id)}
                className={cn('cursor-pointer transition-colors hover:bg-muted/60', selected && 'bg-accent hover:bg-accent')}
              >
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(application.id)
                    }}
                    aria-current={selected ? 'true' : undefined}
                    className="text-left font-medium hover:underline"
                  >
                    {application.name}
                  </button>
                  <span className="block font-mono text-xs text-muted-foreground">{application.id}</span>
                </td>
                <td className="hidden px-3 py-2.5 font-mono text-xs break-all md:table-cell">
                  {application.source.package_id}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline">{SOURCE_LABELS[application.source.type]}</Badge>
                </td>
                <td className="hidden px-3 py-2.5 font-mono text-xs sm:table-cell">{application.version}</td>
                <td className="px-2 py-2.5 text-muted-foreground">
                  <ChevronRight className="size-4" aria-hidden />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

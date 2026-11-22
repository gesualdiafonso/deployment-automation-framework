import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

export type MetricValue =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly value: number }
  /** No data source (or it failed): the number is never invented. */
  | { readonly state: 'unavailable'; readonly reason: string }

interface MetricTileProps {
  label: string
  metric: MetricValue
  /** Small line under the number. */
  caption?: ReactNode
  icon?: ReactNode
}

export function MetricTile({ label, metric, caption, icon }: MetricTileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-5 shadow-card dark:ring-1 dark:ring-white/[0.04]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {icon}
      </div>
      {metric.state === 'loading' ? (
        <Skeleton className="h-9 w-16 rounded-lg" />
      ) : metric.state === 'ready' ? (
        <span className="text-[34px] leading-none font-semibold tracking-tight tabular-nums">{metric.value}</span>
      ) : (
        <span className="text-[34px] leading-none font-semibold tracking-tight text-muted-foreground/50" title={metric.reason}>
          —
        </span>
      )}
      <span className="min-h-4 text-[12px] text-muted-foreground">
        {metric.state === 'unavailable' ? metric.reason : caption}
      </span>
    </div>
  )
}

import { StatusBadge } from '@/components/StatusBadge'

import type { ComponentHealth } from '../lib/system-health'

/** Grouped list of components, one row each (status on the right, detail on hover). */
export function HealthGrid({ components }: { components: readonly ComponentHealth[] }) {
  return (
    <ul className="divide-y divide-border">
      {components.map((component) => (
        <li key={component.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" title={component.detail}>
          <div className="min-w-0">
            <p className="text-[14px] font-medium">{component.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{component.detail}</p>
          </div>
          <StatusBadge domain="health" value={component.status} />
        </li>
      ))}
    </ul>
  )
}

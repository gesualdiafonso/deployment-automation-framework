import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { SOURCE_LABELS } from '@/lib/engine-support'

import type { SourceCount } from '../lib/count-by-source'

export function SourceTypeChart({ data }: { data: readonly SourceCount[] }) {
  const rows = data.map((entry) => ({ ...entry, label: SOURCE_LABELS[entry.source] }))
  return (
    <div className="h-52 w-full" role="img" aria-label="Catalog applications per source">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap="30%">
          <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            cursor={{ fill: 'var(--muted)', radius: 8 }}
            contentStyle={{
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              border: 'none',
              borderRadius: 12,
              boxShadow: 'var(--elevation-pop)',
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" name="Applications" fill="var(--chart-1)" radius={[8, 8, 8, 8]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

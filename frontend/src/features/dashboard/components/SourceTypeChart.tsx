import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { SourceCount } from '../lib/count-by-source'

export function SourceTypeChart({ data }: { data: readonly SourceCount[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Catalog applications per source type">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="source" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            contentStyle={{
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          />
          <Bar dataKey="count" name="Applications" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

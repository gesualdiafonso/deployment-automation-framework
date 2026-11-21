import { Badge } from '@/components/ui/badge'
import { useHealth } from '@/hooks/use-health'
import { cn } from '@/lib/utils'

export function ApiStatusIndicator() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'checking' : isError ? 'offline' : 'online'
  const label = { checking: 'Checking API…', offline: 'API offline', online: `API ${data?.version ?? ''}`.trim() }[
    state
  ]

  return (
    <Badge variant="outline" aria-live="polite" title={label}>
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          state === 'online' && 'bg-emerald-500',
          state === 'offline' && 'bg-destructive',
          state === 'checking' && 'animate-pulse bg-muted-foreground',
        )}
      />
      {label}
    </Badge>
  )
}

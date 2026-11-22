import { useHealth } from '@/hooks/use-health'
import { cn } from '@/lib/utils'

export function ApiStatusIndicator() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'checking' : isError ? 'offline' : 'online'
  const label = { checking: 'Connecting…', offline: 'Offline', online: 'Connected' }[state]
  const title = state === 'online' && data ? `${data.service} ${data.version}` : label

  return (
    <span aria-live="polite" title={title} className="inline-flex items-center gap-2 px-2 text-[12px] text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          state === 'online' && 'bg-success',
          state === 'offline' && 'bg-destructive',
          state === 'checking' && 'animate-pulse bg-neutral',
        )}
      />
      {label}
    </span>
  )
}

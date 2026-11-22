import { LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { resolveStatus, type StatusDomain, TONE_CLASSES } from '@/lib/status'

interface StatusBadgeProps {
  domain: StatusDomain
  /** Raw value (from the API or derived); unknown values render as "Unknown". */
  value: string | null | undefined
  className?: string
}

/** Renders a status as a soft capsule: color dot (or spinner) and label, from lib/status.ts. */
export function StatusBadge({ domain, value, className }: StatusBadgeProps) {
  const status = resolveStatus(domain, value)
  const tone = TONE_CLASSES[status.tone]
  const spinning = status.inProgress && status.icon === LoaderCircle

  return (
    <span
      title={status.description}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap',
        tone.text,
        tone.soft,
        className,
      )}
    >
      {spinning ? (
        <LoaderCircle aria-hidden className="size-3 animate-spin" />
      ) : (
        <span aria-hidden className={cn('size-1.5 rounded-full', tone.dot)} />
      )}
      {status.label}
      <span className="sr-only">: {status.description}</span>
    </span>
  )
}

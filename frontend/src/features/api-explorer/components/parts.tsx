import { TONE_CLASSES, type StatusTone } from '@/lib/status'
import { cn } from '@/lib/utils'

import type { ExplorerMethod } from '../lib/registry'

const MAX_RENDERED_CHARS = 200_000

/** Pretty-printed JSON (or raw text), truncated so a huge body cannot freeze the page. */
export function JsonBlock({ value, text, className }: { value?: unknown; text?: string; className?: string }) {
  const rendered = value !== undefined ? JSON.stringify(value, null, 2) : (text ?? '')
  const truncated = rendered.length > MAX_RENDERED_CHARS
  return (
    <pre
      className={cn(
        'max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre',
        className,
      )}
    >
      {truncated ? `${rendered.slice(0, MAX_RENDERED_CHARS)}\n… (truncated)` : rendered}
    </pre>
  )
}

export function MethodBadge({ method }: { method: ExplorerMethod }) {
  const tone: StatusTone = method === 'GET' ? 'info' : 'warning'
  const classes = TONE_CLASSES[tone]
  return (
    <span
      className={cn(
        'inline-flex w-12 shrink-0 justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold',
        classes.text,
        classes.soft,
        classes.border,
      )}
    >
      {method}
    </span>
  )
}

function statusTone(status: number): StatusTone {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 300 && status < 400) return 'info'
  if (status >= 400 && status < 500) return 'warning'
  return 'danger'
}

export function HttpStatusBadge({ status }: { status: number }) {
  const classes = TONE_CLASSES[statusTone(status)]
  return (
    <span
      className={cn('rounded border px-1.5 py-0.5 font-mono text-xs font-semibold', classes.text, classes.soft, classes.border)}
    >
      {status}
    </span>
  )
}

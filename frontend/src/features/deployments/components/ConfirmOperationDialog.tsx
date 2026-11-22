import { useEffect, useState, type ReactNode } from 'react'
import { FlaskConical, TriangleAlert } from 'lucide-react'

import { StatusBadge } from '@/components/StatusBadge'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import type { InstallationStatus } from '@/lib/status'
import type { PreviewResponse } from '@/types/deployment'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function useSecondsLeft(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])
  if (!expiresAt) return null
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
}

interface ConfirmOperationDialogProps {
  preview: PreviewResponse
  installation: InstallationStatus
  isSubmitting: boolean
  error: unknown
  onConfirm: () => void
  onClose: () => void
}

/**
 * The only place an install or uninstall can be confirmed. Shows exactly what the
 * API approved in the preview. A real uninstall needs the application ID typed in.
 */
export function ConfirmOperationDialog({
  preview,
  installation,
  isSubmitting,
  error,
  onConfirm,
  onClose,
}: ConfirmOperationDialogProps) {
  const { application, action, mode } = preview
  const isReal = mode === 'execute'
  const isRealUninstall = isReal && action === 'uninstall'
  const [typedId, setTypedId] = useState('')
  const secondsLeft = useSecondsLeft(preview.expires_at)
  const expired = secondsLeft === 0

  const blocked = !preview.supported || !preview.confirmation_token || !preview.agent_ready || expired
  const typedOk = !isRealUninstall || typedId.trim() === application.id
  const verb = action === 'install' ? 'Install' : 'Uninstall'

  return (
    <AlertDialog open onOpenChange={(open) => (!open && !isSubmitting ? onClose() : undefined)}>
      <AlertDialogContent className={isRealUninstall ? 'border-destructive/60' : undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isReal ? (
              <TriangleAlert className={isRealUninstall ? 'size-5 text-destructive' : 'size-5 text-warning'} aria-hidden />
            ) : (
              <FlaskConical className="size-5 text-warning" aria-hidden />
            )}
            {isReal ? `${verb} ${application.name}?` : `Dry run: ${verb.toLowerCase()} ${application.name}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isReal
              ? `This makes a real change on the agent's machine through winget.`
              : 'Preview only: the engine runs with -WhatIf. Nothing is installed or uninstalled.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="divide-y rounded-xl bg-card ring-1 ring-border px-3">
          <Row label="Application">{application.name}</Row>
          <Row label="Application ID">
            <code className="font-mono text-xs">{application.id}</code>
          </Row>
          <Row label="Package">
            <code className="font-mono text-xs">
              {application.source.package_id} ({application.source.type})
            </code>
          </Row>
          <Row label="Action">
            <span className="font-medium">{verb}</span>
          </Row>
          <Row label="Mode">
            {isReal ? (
              <span className="font-semibold text-destructive">Real execution</span>
            ) : (
              <span className="font-medium text-warning">Dry run (no changes)</span>
            )}
          </Row>
          <Row label="Current state">
            <StatusBadge domain="installation" value={installation} />
          </Row>
        </dl>

        {preview.warnings.length > 0 ? (
          <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {preview.warnings.map((warning) => (
              <li key={warning} className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                {warning}
              </li>
            ))}
          </ul>
        ) : null}
        {preview.notes.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {preview.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        {isRealUninstall ? (
          <label className="block space-y-1 text-sm">
            <span>
              Type <code className="font-mono font-semibold">{application.id}</code> to confirm the removal.
            </span>
            <input
              value={typedId}
              onChange={(event) => setTypedId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-lg bg-secondary px-3 font-mono text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
        ) : null}

        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}
        {secondsLeft !== null ? (
          <p className="text-xs text-muted-foreground">
            {expired ? 'This confirmation expired. Close and request a new preview.' : `Confirmation valid for ${secondsLeft} s.`}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <Button
            variant={isReal ? 'destructive' : 'default'}
            onClick={onConfirm}
            // Disabled while the request is in flight: a double click cannot send it twice
            // (and the API accepts each confirmation token only once).
            disabled={blocked || !typedOk || isSubmitting || Boolean(error)}
          >
            {isSubmitting ? 'Sending…' : isReal ? `${verb} now` : 'Run dry run'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

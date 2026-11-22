import type { AuditRecord } from '@/types/deployment'

const EVENT_LABELS: Readonly<Record<string, string>> = {
  agent_online: 'Agent online',
  operation_requested: 'Requested',
  operation_claimed: 'Taken by agent',
  operation_completed: 'Completed',
  operation_failed: 'Failed',
  operation_cancelled: 'Cancelled',
  operation_expired: 'Expired',
  operation_lost: 'Outcome unknown',
}

function details(record: AuditRecord): string {
  const parts = [
    record.action ? `${record.action}${record.mode ? ` (${record.mode})` : ''}` : null,
    record.engine_status ? `engine: ${record.engine_status}` : null,
    record.exit_code !== null ? `exit ${record.exit_code}` : null,
    record.origin ? `from ${record.origin}` : null,
    record.agent_id ? `agent ${record.agent_id}` : null,
    record.log_file ? `log ${record.log_file}` : null,
    record.reason,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Raw audit trail, one row per line of the audit log. Already free of secrets server-side. */
export function AuditTable({ records, onSelectOperation }: { records: readonly AuditRecord[]; onSelectOperation?: (id: string) => void }) {
  if (records.length === 0) return <p className="text-sm text-muted-foreground">No audit records.</p>
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-[12px] text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Time</th>
            <th scope="col" className="px-3 py-2 font-medium">Event</th>
            <th scope="col" className="px-3 py-2 font-medium">Application</th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Details</th>
            <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Operation</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {records.map((record, index) => (
            <tr key={`${record.timestamp}-${index}`} className="align-top">
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{new Date(record.timestamp).toLocaleString()}</td>
              <td className="px-3 py-2 whitespace-nowrap">{EVENT_LABELS[record.event] ?? record.event}</td>
              <td className="px-3 py-2 font-mono text-xs">{record.application_id ?? '—'}</td>
              <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">{details(record) || '—'}</td>
              <td className="hidden px-3 py-2 font-mono text-xs lg:table-cell">
                {record.operation_id && onSelectOperation ? (
                  <button type="button" className="text-primary hover:underline" onClick={() => onSelectOperation(record.operation_id as string)}>
                    {record.operation_id.slice(0, 8)}
                  </button>
                ) : (
                  (record.operation_id?.slice(0, 8) ?? '—')
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

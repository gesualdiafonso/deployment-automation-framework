import { StatusBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'
import type { Operation } from '@/types/deployment'

function describe(operation: Operation): string {
  if (operation.action === 'detect') return 'detect'
  return `${operation.action} · ${operation.mode === 'execute' ? 'real' : 'dry run'}`
}

export function OperationHistory({
  operations,
  selectedId,
  onSelect,
}: {
  operations: readonly Operation[]
  selectedId: string | null
  onSelect: (operationId: string) => void
}) {
  if (operations.length === 0) {
    return <p className="text-sm text-muted-foreground">No operations yet.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-[12px] text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Application</th>
            <th scope="col" className="px-3 py-2 font-medium">Operation</th>
            <th scope="col" className="px-3 py-2 font-medium">State</th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Result</th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Exit code</th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Requested</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {operations.map((operation) => (
            <tr
              key={operation.operation_id}
              className={cn(
                'cursor-pointer hover:bg-muted/60',
                operation.operation_id === selectedId && 'bg-accent hover:bg-accent',
              )}
              onClick={() => onSelect(operation.operation_id)}
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-left font-medium hover:underline"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(operation.operation_id)
                  }}
                >
                  {operation.application_name}
                </button>
              </td>
              <td className="px-3 py-2 text-xs whitespace-nowrap">{describe(operation)}</td>
              <td className="px-3 py-2">
                <StatusBadge domain="deploymentRequest" value={operation.state} />
              </td>
              <td className="hidden px-3 py-2 sm:table-cell">
                {operation.result?.engine_status ? (
                  <StatusBadge domain="engineResult" value={operation.result.engine_status} />
                ) : operation.result?.detected_installed !== null && operation.result?.detected_installed !== undefined ? (
                  <StatusBadge domain="installation" value={operation.result.detected_installed ? 'installed' : 'not_installed'} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="hidden px-3 py-2 font-mono text-xs md:table-cell">{operation.result?.exit_code ?? '—'}</td>
              <td className="hidden px-3 py-2 text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                {new Date(operation.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

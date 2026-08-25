"use client"

/* Section 3: real recent executions. Clicking a row navigates to
 * /outputs?execution=<id> — the SAME real OutputDrawer/execution
 * experience Outputs already has (see the small addition in
 * components/outputs/outputs-hub.tsx that opens the drawer for that
 * query param). No parallel execution-detail UI is created here. */

import Link from "next/link"
import { StatusPill } from "./status-pill"
import type { ExecutionListItem } from "./types"

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

const APPROVAL_LABEL: Record<NonNullable<ExecutionListItem["approvalStatus"]>, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
}

export function ExecutionsTable({
  items,
  total,
  limit,
  offset,
  onPage,
}: {
  items: ExecutionListItem[]
  total: number
  limit: number
  offset: number
  onPage: (offset: number) => void
}) {
  if (items.length === 0) {
    return <p className="mt-4 rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No executions match these filters.</p>
  }

  return (
    <div className="mt-4">
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/40">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Worker</th>
              <th className="px-4 py-2.5 font-medium">Execution</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Started</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
              <th className="px-4 py-2.5 font-medium">Outputs</th>
              <th className="px-4 py-2.5 font-medium">Approval</th>
              <th className="px-4 py-2.5 font-medium">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {items.map((e) => (
              <tr key={e.id} className="transition-colors hover:bg-secondary/30">
                <td className="px-4 py-2.5">
                  <Link href={`/outputs?execution=${encodeURIComponent(e.id)}`} className="font-medium text-foreground hover:text-primary">
                    {e.workerName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{e.id.replace(/^exec_/, "").slice(0, 8)}</td>
                <td className="px-4 py-2.5">
                  <StatusPill status={e.status} />
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(e.startedAt)}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e.outputCount}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{e.approvalStatus ? APPROVAL_LABEL[e.approvalStatus] : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e.maxAttempt != null && e.maxAttempt > 1 ? `${e.maxAttempt} attempts` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button onClick={() => onPage(Math.max(0, offset - limit))} disabled={offset === 0} className="rounded-md border border-border px-2.5 py-1 transition-colors hover:text-foreground disabled:opacity-40">
              Prev
            </button>
            <button onClick={() => onPage(offset + limit)} disabled={offset + limit >= total} className="rounded-md border border-border px-2.5 py-1 transition-colors hover:text-foreground disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

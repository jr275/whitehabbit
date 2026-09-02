"use client"

/* Section 5: real Worker-level health — one row per real Worker
 * (GET /api/observatory/workers), including a Worker that has never
 * run (real zeros/dashes, never hidden). */

import { StatusPill } from "./status-pill"
import type { WorkerHealth } from "./types"

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

export function WorkerHealthTable({ workers }: { workers: WorkerHealth[] }) {
  if (workers.length === 0) {
    return <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-[12.5px] text-muted-foreground">No Workers in this workspace yet.</p>
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-border/60 bg-card/40">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Worker</th>
            <th className="px-4 py-2.5 font-medium">Current status</th>
            <th className="px-4 py-2.5 font-medium">Executions</th>
            <th className="px-4 py-2.5 font-medium">Success rate</th>
            <th className="px-4 py-2.5 font-medium">Failures</th>
            <th className="px-4 py-2.5 font-medium">Outputs</th>
            <th className="px-4 py-2.5 font-medium">Avg duration</th>
            <th className="px-4 py-2.5 font-medium">Last run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {workers.map((w) => (
            <tr key={w.workerId}>
              <td className="px-4 py-2.5 font-medium text-foreground">{w.workerName}</td>
              <td className="px-4 py-2.5">{w.lastExecutionStatus ? <StatusPill status={w.lastExecutionStatus} /> : <span className="text-muted-foreground">Never run</span>}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.executions}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.successRate == null ? "—" : `${Math.round(w.successRate * 100)}%`}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.failed}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.outputs}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.avgDurationMs != null ? `${(w.avgDurationMs / 1000).toFixed(1)}s` : "—"}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{w.lastExecutionAt != null ? timeAgo(w.lastExecutionAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

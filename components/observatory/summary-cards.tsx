"use client"

/* The real Observatory's headline strip — every number here comes
 * straight from GET /api/observatory/summary's real SQL aggregate
 * (lib/db/repo.ts's getExecutionSummary). A metric whose denominator
 * is empty renders "—", never a fabricated 0% or 0. */

import type { ExecutionSummary } from "./types"

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function SummaryCards({ summary }: { summary: ExecutionSummary }) {
  const cards = [
    { label: "Total executions", value: String(summary.total) },
    { label: "Completed", value: String(summary.completed) },
    { label: "Failed", value: String(summary.failed) },
    { label: "Running", value: String(summary.running) },
    { label: "Pending / blocked", value: String(summary.pendingApproval + summary.blocked) },
    { label: "Success rate", value: fmtPct(summary.successRate) },
    { label: "Avg duration", value: fmtDuration(summary.avgDurationMs) },
    { label: "Outputs", value: String(summary.totalOutputs) },
    { label: "Approvals", value: String(summary.totalApprovals) },
    { label: "Approval rate", value: fmtPct(summary.approvalRate) },
  ]

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="bg-card px-4 py-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{c.value}</div>
        </div>
      ))}
    </div>
  )
}

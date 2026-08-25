"use client"

/* Section 6: useful filters without overengineering — Worker, status,
 * a bounded date-range preset, and approval state. Every change here
 * re-fetches the real summary/executions/activity from the server
 * with the new filter applied (server-side filtering, never a
 * client-side re-scan of an already-loaded list). */

import type { ExecutionStatus, ObservatoryFilters, WorkerHealth } from "./types"

const STATUS_OPTIONS: { value: ExecutionStatus; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "resuming", label: "Resuming" },
  { value: "retrying", label: "Retrying" },
  { value: "pending_approval", label: "Waiting for approval" },
  { value: "blocked", label: "Blocked" },
  { value: "partially_completed", label: "Partially completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "queued", label: "Queued" },
]

const RANGE_OPTIONS = [
  { value: "", label: "All time" },
  { value: String(24 * 60 * 60 * 1000), label: "Last 24h" },
  { value: String(7 * 24 * 60 * 60 * 1000), label: "Last 7d" },
  { value: String(30 * 24 * 60 * 60 * 1000), label: "Last 30d" },
]

const APPROVAL_OPTIONS: { value: NonNullable<ObservatoryFilters["approvalState"]>; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "none", label: "No approval" },
]

const selectCls = "rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-foreground outline-none transition-colors focus:border-primary/60"

export function ObservatoryFiltersBar({
  filters,
  rangeMs,
  workers,
  onChange,
  onRangeChange,
}: {
  filters: ObservatoryFilters
  rangeMs: string
  workers: WorkerHealth[]
  onChange: (next: ObservatoryFilters) => void
  onRangeChange: (rangeMs: string) => void
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <select className={selectCls} value={filters.workerId ?? ""} onChange={(e) => onChange({ ...filters, workerId: e.target.value || undefined })}>
        <option value="">All workers</option>
        {workers.map((w) => (
          <option key={w.workerId} value={w.workerId}>
            {w.workerName}
          </option>
        ))}
      </select>

      <select className={selectCls} value={filters.status ?? ""} onChange={(e) => onChange({ ...filters, status: (e.target.value || undefined) as ExecutionStatus | undefined })}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select className={selectCls} value={rangeMs} onChange={(e) => onRangeChange(e.target.value)}>
        {RANGE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <select className={selectCls} value={filters.approvalState ?? ""} onChange={(e) => onChange({ ...filters, approvalState: (e.target.value || undefined) as ObservatoryFilters["approvalState"] })}>
        <option value="">Any approval state</option>
        {APPROVAL_OPTIONS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>

      {(filters.workerId || filters.status || filters.approvalState || rangeMs) && (
        <button
          onClick={() => {
            onChange({})
            onRangeChange("")
          }}
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

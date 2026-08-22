"use client"

/* ------------------------------------------------------------------ *
 * Output table — the dense operational ledger: Worker | Task | Output
 * | Tools | Status | Quality | Time. One row per real execution.
 * Clicking a row opens the real output it produced (or the real
 * reason it didn't).
 * ------------------------------------------------------------------ */

import { useMemo, useState } from "react"
import { SKILL_CATALOG, TOOL_CATALOG } from "@/lib/workforce/catalog"
import type { Worker, WorkerExecution, WorkerOutput, WorkerTask } from "@/lib/workforce/model"
import { EXECUTION_STATUS_META, OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { isToday, timeOfDay } from "@/lib/workforce/selectors"

interface Row {
  execution: WorkerExecution
  worker: Worker
  task: WorkerTask
  output?: WorkerOutput
  tools: string
  filterGroup: string
  time: number
}

const STATUSES = ["running", "completed", "blocked", "pending_approval", "failed"] as const

export function OutputTable({
  workers,
  tasks,
  executions,
  outputs,
  onOpenExecution,
}: {
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
  onOpenExecution: (executionId: string) => void
}) {
  const [category, setCategory] = useState("All")
  const [workerFilter, setWorkerFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const e of executions) {
      if (!isToday(e.startedAt)) continue
      const worker = workers.find((w) => w.id === e.workerId)
      const task = tasks.find((t) => t.id === e.taskId)
      if (!worker || !task) continue
      const template = SKILL_CATALOG.find((t) => t.id === task.skillId)
      const output = outputs.find((o) => o.executionId === e.id)
      const tools = template?.requiredTools.map((id) => TOOL_CATALOG.find((t) => t.id === id)?.name ?? id).join(" + ") ?? "—"
      out.push({
        execution: e,
        worker,
        task,
        output,
        tools,
        filterGroup: template ? OUTPUT_TYPE_META[template.outputType]?.filter ?? "Other" : "Other",
        time: e.completedAt ?? e.startedAt,
      })
    }
    return out.sort((a, b) => b.time - a.time)
  }, [workers, tasks, executions, outputs])

  const categories = useMemo(() => ["All", ...Array.from(new Set(rows.map((r) => r.filterGroup))).sort()], [rows])

  const filtered = rows.filter(
    (r) =>
      (category === "All" || r.filterGroup === category) &&
      (workerFilter === "all" || r.worker.id === workerFilter) &&
      (statusFilter === "all" || r.execution.status === statusFilter),
  )

  return (
    <div>
      {/* filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
              category === c ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} className="modal-input w-auto py-1 text-[12px]">
          <option value="all">All workers</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.identity.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="modal-input w-auto py-1 text-[12px]">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {EXECUTION_STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>

      {/* table */}
      <div className="thin-scroll-light mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              {["Worker", "Task", "Output", "Tools", "Status", "Quality", "Time"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.execution.id}
                onClick={() => onOpenExecution(r.execution.id)}
                className="cursor-pointer border-b border-border/70 bg-card transition-colors last:border-b-0 hover:bg-secondary/40"
              >
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.worker.identity.accent }} />
                    {r.worker.identity.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[13px] text-foreground">{r.task.title}</td>
                <td className="max-w-xs truncate px-4 py-2.5 text-[12.5px] text-foreground">
                  {r.output?.title ?? (r.execution.status === "running" ? "…" : r.execution.blockedReason ? "No output" : "—")}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-muted-foreground">{r.tools}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <StatusPill status={r.execution.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px] tabular-nums text-foreground">
                  {r.output?.qualityScore != null ? `${r.output.qualityScore}%` : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{timeOfDay(r.time)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  No executions match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: WorkerExecution["status"] }) {
  const meta = EXECUTION_STATUS_META[status]
  const cls =
    meta.tone === "good" ? "text-grow bg-grow/10" : meta.tone === "info" ? "text-primary bg-primary/10" : meta.tone === "warn" ? "text-warn bg-warn/10" : "text-destructive bg-destructive/10"
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{meta.label}</span>
}

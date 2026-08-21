"use client"

/* ------------------------------------------------------------------ *
 * Output table — the dense operational ledger: Worker | Task | Output
 * | Channel | Status | Quality | Time. One row per batch (an
 * execution), because that's how the work actually happened; clicking
 * a row opens every individual output inside it.
 * ------------------------------------------------------------------ */

import { useMemo, useState } from "react"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import type { Worker, WorkerExecution, WorkerOutput, WorkerTask } from "@/lib/workforce/model"
import { OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { isToday, timeOfDay } from "@/lib/workforce/selectors"

interface Row {
  execution: WorkerExecution
  worker: Worker
  task: WorkerTask
  unit: string
  channel: string
  status: string
  statusTone: "good" | "info" | "warn" | "bad"
  quality: number | null
  time: number
  filterGroup: string
}

const STATUSES = ["Completed", "Published", "In progress", "Awaiting approval", "Failed"] as const

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
  const [statusFilter, setStatusFilter] = useState("all")

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const e of executions) {
      if (!isToday(e.startedAt)) continue
      const worker = workers.find((w) => w.id === e.workerId)
      const task = tasks.find((t) => t.id === e.taskId)
      if (!worker || !task) continue
      const template = SKILL_CATALOG.find((t) => t.id === task.skillId)
      const matching = outputs.filter((o) => o.executionId === e.id)
      const channel = matching[0]?.channel ?? "—"
      const failedCount = matching.filter((o) => o.status === "failed").length
      const pendingApproval = matching.some((o) => o.approval === "pending")
      const publishedMost = matching.length > 0 && matching.filter((o) => o.status === "published").length >= matching.length / 2

      let status = "Completed"
      let statusTone: Row["statusTone"] = "good"
      if (e.status === "running") {
        status = "In progress"
        statusTone = "info"
      } else if (pendingApproval) {
        status = "Awaiting approval"
        statusTone = "warn"
      } else if (failedCount > 0 && failedCount === matching.length) {
        status = "Failed"
        statusTone = "bad"
      } else if (publishedMost) {
        status = "Published"
        statusTone = "good"
      }

      const quality = matching.length ? Math.round(matching.reduce((s, o) => s + (o.qualityScore ?? 0), 0) / matching.length) : null

      out.push({
        execution: e,
        worker,
        task,
        unit: template ? `${e.done} ${e.done === 1 ? template.unit.replace(/s$/, "") : template.unit}` : `${e.done}`,
        channel: String(channel),
        status,
        statusTone,
        quality,
        time: e.completedAt ?? e.startedAt,
        filterGroup: template ? OUTPUT_TYPE_META[template.produces].filter : "Other",
      })
    }
    return out.sort((a, b) => b.time - a.time)
  }, [workers, tasks, executions, outputs])

  const categories = useMemo(() => ["All", ...Array.from(new Set(rows.map((r) => r.filterGroup))).sort()], [rows])

  const filtered = rows.filter(
    (r) =>
      (category === "All" || r.filterGroup === category) &&
      (workerFilter === "all" || r.worker.id === workerFilter) &&
      (statusFilter === "all" || r.status === statusFilter),
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
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* table */}
      <div className="thin-scroll-light mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              {["Worker", "Task", "Output", "Channel", "Status", "Quality", "Time"].map((h) => (
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
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px] text-foreground">{r.unit}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px] capitalize text-muted-foreground">{r.channel}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <StatusPill tone={r.statusTone} label={r.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px] tabular-nums text-foreground">
                  {r.quality != null ? `${r.quality}%` : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{timeOfDay(r.time)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  No outputs match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusPill({ tone, label }: { tone: "good" | "info" | "warn" | "bad"; label: string }) {
  const cls =
    tone === "good" ? "text-grow bg-grow/10" : tone === "info" ? "text-primary bg-primary/10" : tone === "warn" ? "text-warn bg-warn/10" : "text-destructive bg-destructive/10"
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{label}</span>
}

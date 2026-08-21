/* ------------------------------------------------------------------ *
 * Workers Working Now — the platform, alive. One card per running
 * execution, showing the real current stage (from the real event
 * stream) and real elapsed time — never a fake percentage.
 * ------------------------------------------------------------------ */

import { Loader2 } from "lucide-react"
import type { Worker, WorkerEvent, WorkerExecution, WorkerTask } from "@/lib/workforce/model"
import { activeWork } from "@/lib/workforce/selectors"

export function ActiveWork({
  workers,
  executions,
  tasks,
  events,
}: {
  workers: Worker[]
  executions: WorkerExecution[]
  tasks: WorkerTask[]
  events: WorkerEvent[]
}) {
  const items = activeWork(workers, executions, tasks, events)
  if (items.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Workers Working Now</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => (
          <div key={a.executionId} className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: a.accent }}>
                {a.workerName.slice(0, 2).toUpperCase()}
              </span>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">{a.workerName}</span>
            </div>
            <p className="mt-2.5 truncate text-[12.5px] font-medium text-foreground">{a.taskTitle}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11.5px] text-muted-foreground">{a.stage}</span>
              <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{a.elapsedSeconds}s</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

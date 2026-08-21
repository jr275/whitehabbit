/* ------------------------------------------------------------------ *
 * Workers Working Now — the platform, alive. One card per running
 * execution, driven by the same event stream Run Worker started.
 * ------------------------------------------------------------------ */

import { Loader2 } from "lucide-react"
import type { Worker, WorkerExecution, WorkerOutput, WorkerTask } from "@/lib/workforce/model"

export function ActiveWork({
  workers,
  executions,
  tasks,
  outputs,
}: {
  workers: Worker[]
  executions: WorkerExecution[]
  tasks: WorkerTask[]
  outputs: WorkerOutput[]
}) {
  const running = executions.filter((e) => e.status === "running")
  if (running.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Workers Working Now</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {running.map((e) => {
          const worker = workers.find((w) => w.id === e.workerId)
          const task = tasks.find((t) => t.id === e.taskId)
          const latest = outputs.find((o) => o.executionId === e.id)
          const remaining = Math.max(0, e.target - e.done)
          const etaSeconds = Math.max(1, Math.round(remaining * 0.42))
          if (!worker) return null
          return (
            <div key={e.id} className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: worker.identity.accent }}>
                  {worker.identity.initials}
                </span>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">{worker.identity.name}</span>
              </div>
              <p className="mt-2.5 text-[12px] text-muted-foreground">{task?.title ?? e.label}</p>
              {latest && <p className="mt-0.5 truncate text-[12.5px] font-medium text-foreground">&ldquo;{latest.title}&rdquo;</p>}
              <div className="mt-3 flex items-center justify-between font-mono text-[10.5px] text-muted-foreground">
                <span>{e.progress}%</span>
                <span>ETA ~{etaSeconds}s</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${e.progress}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

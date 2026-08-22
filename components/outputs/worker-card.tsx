"use client"

/* ------------------------------------------------------------------ *
 * Worker output card — "Today's Work" made concrete per worker. Every
 * number is clickable: it opens the underlying output records in the
 * drawer. Capabilities and outputs are never mixed here — this card
 * only ever answers "what did it produce", never "what can it do".
 * ------------------------------------------------------------------ */

import type { Worker, WorkerOutput, WorkerTask } from "@/lib/workforce/model"
import { todaysWorkByType, workerTaskSummary } from "@/lib/workforce/selectors"

export function WorkerOutputCard({
  worker,
  tasks,
  outputs,
  running,
  onOpenType,
}: {
  worker: Worker
  tasks: WorkerTask[]
  outputs: WorkerOutput[]
  running: boolean
  onOpenType: (workerId: string, type: WorkerOutput["type"]) => void
}) {
  const byType = todaysWorkByType(worker.id, outputs)
  const summary = workerTaskSummary(worker.id, tasks, outputs)

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold text-white"
          style={{ backgroundColor: worker.identity.accent || "#5a6ef0" }}
        >
          {worker.identity.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{worker.identity.name}</h3>
            {running && (
              <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Working
              </span>
            )}
          </div>
          <p className="truncate text-[12px] text-muted-foreground">{worker.identity.role}</p>
        </div>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Today</p>
      {byType.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">No outputs yet today.</p>
      ) : (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {byType.map((t) => (
            <button
              key={t.type}
              onClick={() => onOpenType(worker.id, t.type)}
              className="rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="font-mono text-[17px] font-semibold tabular-nums text-foreground">{t.count}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">{t.label}</div>
            </button>
          ))}
        </div>
      )}

      <div className={`mt-4 grid gap-2 border-t border-border pt-3.5 ${summary.pendingApproval > 0 ? "grid-cols-6" : "grid-cols-5"}`}>
        <MiniStat value={String(summary.tasks)} label="Tasks" />
        <MiniStat value={String(summary.completed)} label="Completed" tone="good" />
        <MiniStat value={String(summary.failed)} label="Failed" tone={summary.failed > 0 ? "bad" : undefined} />
        <MiniStat value={String(summary.blocked)} label="Blocked" tone={summary.blocked > 0 ? "warn" : undefined} />
        {summary.pendingApproval > 0 && <MiniStat value={String(summary.pendingApproval)} label="Pending" tone="warn" />}
        <MiniStat value={summary.quality != null ? `${summary.quality}%` : "—"} label="Quality" />
      </div>
    </article>
  )
}

function MiniStat({ value, label, tone }: { value: string; label: string; tone?: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-grow" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-destructive" : "text-foreground"
  return (
    <div>
      <div className={`font-mono text-[13px] font-medium tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[9.5px] text-muted-foreground">{label}</div>
    </div>
  )
}

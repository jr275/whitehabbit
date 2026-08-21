"use client"

import { useEffect, useRef } from "react"
import { studioStore } from "@/lib/worker/worker-state"
import type {
  ExecutionEvent,
  RunResult,
  Worker,
} from "@/lib/worker/worker-model"

/* ------------------------------------------------------------------ *
 * LIVE RESULT — the right zone. A projection of the active run's event
 * stream: live metrics, the execution feed, the decision, the approval
 * gate, proposed memory, the proposed next action, an optional causal
 * trace, and prior run history. Everything here is derived from store
 * state; the panel dispatches approve/reject/save-memory/run-next.
 * ------------------------------------------------------------------ */

const STATUS_DOT: Record<string, string> = {
  info: "bg-primary",
  ok: "bg-grow",
  warn: "bg-warn",
  error: "bg-destructive",
}

const RUN_STATUS_LABEL: Record<RunResult["status"], string> = {
  running: "Running",
  awaiting_approval: "Awaiting approval",
  complete: "Complete",
  rejected: "Rejected",
  error: "Error",
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/60 px-2.5 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function EventRow({ ev, dense }: { ev: ExecutionEvent; dense: boolean }) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[ev.status]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            {ev.type.replace(/_/g, " ")}
          </span>
          {ev.capability && (
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">{ev.capability}</span>
          )}
        </div>
        <p className={`text-foreground/90 ${dense ? "text-[11px]" : "text-[12px]"}`}>{ev.message}</p>
      </div>
    </div>
  )
}

export function ResultPanel({
  worker,
  activeRun,
  history,
  showTrace,
  running,
}: {
  worker: Worker
  activeRun: RunResult | null
  history: RunResult[]
  showTrace: boolean
  running: boolean
}) {
  const feedRef = useRef<HTMLDivElement>(null)

  // auto-scroll the live feed as events arrive
  useEffect(() => {
    if (running && feedRef.current) feedRef.current.scrollTop = 0
  }, [activeRun?.events.length, running])

  if (!activeRun) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="max-w-[16rem]">
          <p className="text-sm font-medium text-foreground">No active run</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Give {worker.name} a task from the fabric to watch it research, reason, decide and act — live.
          </p>
          {history.length > 0 && (
            <div className="mt-6 text-left">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Recent runs
              </p>
              <div className="space-y-1.5">
                {history.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => studioStore.viewRun(r.id)}
                    className="flex w-full items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-left transition hover:border-primary/40"
                  >
                    <span className="truncate text-[11px] text-foreground/80">{r.objective}</span>
                    <span className="ml-2 shrink-0 font-mono text-[9px] text-muted-foreground">#{r.id}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const run = activeRun
  const awaiting = run.status === "awaiting_approval"
  const trace = showTrace

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              #{run.id} · v{run.workerVersion}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">{run.objective}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
              awaiting
                ? "bg-warn/15 text-warn"
                : run.status === "complete"
                  ? "bg-grow/15 text-grow"
                  : run.status === "rejected" || run.status === "error"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-primary/15 text-primary"
            }`}
          >
            {RUN_STATUS_LABEL[run.status]}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{run.currentAction}</p>
      </div>

      <div ref={feedRef} className="thin-scroll-light min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* live metrics */}
        <div className="grid grid-cols-4 gap-1.5">
          <Metric label="Sources" value={run.sources} />
          <Metric label="Evidence" value={run.evidence} />
          <Metric label="Signals" value={run.signals} />
          <Metric label="Conf." value={run.confidence != null ? `${run.confidence}%` : "—"} />
        </div>

        {/* decision */}
        {run.decision && (
          <div className="mt-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Decision</span>
              <span
                className={`font-mono text-[11px] font-semibold ${
                  run.decision === "QUALIFIED"
                    ? "text-grow"
                    : run.decision === "NOT_QUALIFIED"
                      ? "text-destructive"
                      : "text-warn"
                }`}
              >
                {run.decision.replace(/_/g, " ")}
              </span>
            </div>
            {run.decisionFactors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {run.decisionFactors.map((f, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-foreground/80">
                    <span className="text-muted-foreground">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* approval gate — the emotional centrepiece */}
        {awaiting && (
          <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-warn">Approval required</p>
            <p className="mt-1.5 text-[12px] text-foreground">{run.action}</p>
            {run.approvalReason && (
              <p className="mt-1 text-[11px] text-muted-foreground">{run.approvalReason}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => studioStore.approve()}
                className="flex-1 rounded-md bg-grow px-3 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => studioStore.reject()}
                className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:border-destructive/50 hover:text-destructive"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* outcome */}
        {run.outcome && (
          <div className="mt-3 rounded-lg border border-border bg-card p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Outcome</p>
            <p className="mt-1 text-[12px] text-foreground">{run.outcome}</p>
          </div>
        )}

        {/* proposed memory */}
        {run.proposedMemory && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Learned something</p>
            <p className="mt-1 text-[12px] text-foreground">{run.proposedMemory.text}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              confidence {run.proposedMemory.confidence}%
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => studioStore.saveMemory()}
                className="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition hover:opacity-90"
              >
                Save to memory
              </button>
              <button
                type="button"
                onClick={() => studioStore.discardMemory()}
                className="rounded-md border border-border px-3 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* proposed next action (medium autonomy) */}
        {run.nextActionProposed && run.status === "complete" && (
          <div className="mt-3 rounded-lg border border-border bg-secondary/60 p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Proposed next action
            </p>
            <p className="mt-1 text-[12px] text-foreground">{run.nextActionProposed}</p>
            <button
              type="button"
              onClick={() => studioStore.runProposedNext()}
              disabled={running}
              className="mt-2 rounded-md bg-foreground px-3 py-1 text-[11px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
            >
              Run this next
            </button>
          </div>
        )}

        {/* execution stream / trace toggle */}
        <div className="mt-4 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {trace ? "Causal trace" : "Execution stream"}
          </p>
          <button
            type="button"
            onClick={() => studioStore.toggleTrace()}
            className="font-mono text-[10px] uppercase tracking-wider text-primary transition hover:opacity-80"
          >
            {trace ? "Live feed" : "Trace"}
          </button>
        </div>

        <div className="mt-1.5 divide-y divide-border/60">
          {(trace ? run.events : [...run.events].reverse()).map((ev) => (
            <EventRow key={ev.id} ev={ev} dense={trace} />
          ))}
        </div>

        {/* run history */}
        {history.length > 0 && (
          <div className="mt-5 border-t border-border pt-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Run history
            </p>
            <div className="space-y-1.5">
              {history.slice(0, 8).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => studioStore.viewRun(r.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition ${
                    r.id === run.id ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      r.status === "complete" ? "bg-grow" : r.status === "rejected" ? "bg-destructive" : "bg-warn"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{r.objective}</span>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{timeAgo(r.startedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

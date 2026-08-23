"use client"

/* ================================================================== *
 * WORKER STUDIO — the primary environment for creating a Worker.
 *
 * Three panels, one source of truth (workforceStore):
 *   LEFT   — BUILD         : the 9-stage worker builder
 *   CENTER — WORKER CANVAS : the living worker + Run Worker
 *   RIGHT  — LIVE OUTPUTS  : examples while building, real records once run
 *
 * Switching workers, or creating a new one, never loses another
 * worker's build state — everything lives in the same store used by
 * the Outputs Hub and Worker Overview.
 * ------------------------------------------------------------------ */

import { ChevronDown, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { BuildPanel } from "@/components/studio/build-panel"
import { LiveOutputsPanel } from "@/components/studio/live-outputs-panel"
import { StudioShell } from "@/components/studio/studio-shell"
import { WorkerCanvas } from "@/components/studio/worker-canvas"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

const STATUS_STYLE: Record<string, { cls: string; label: string; pulse?: boolean }> = {
  draft: { cls: "border-border text-muted-foreground", label: "Draft" },
  ready: { cls: "border-primary/30 text-primary", label: "Ready" },
  live: { cls: "border-grow/30 text-grow", label: "Live", pulse: true },
  idle: { cls: "border-grow/30 text-grow", label: "Live", pulse: true },
  working: { cls: "border-primary/30 text-primary", label: "Working", pulse: true },
}

export function WorkerStudio() {
  const { hydrated, workers, activeWorkerId, tasks, executions, outputs, events } = useWorkforce()

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  if (!hydrated) {
    return (
      <StudioShell>
        <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Loading studio…</span>
        </div>
      </StudioShell>
    )
  }

  const worker = workers.find((w) => w.id === activeWorkerId) ?? workers[0]

  if (!worker) {
    return (
      <StudioShell>
        <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-4 text-center">
          <p className="text-[15px] text-muted-foreground">No worker yet.</p>
          <button
            onClick={() => workforceStore.createDraftWorker()}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Create a worker
          </button>
        </div>
      </StudioShell>
    )
  }

  const running = workforceStore.isRunning(worker.id)
  const status = running ? STATUS_STYLE.working : (STATUS_STYLE[worker.status] ?? STATUS_STYLE.draft)

  return (
    <StudioShell>
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
        {/* studio sub-header — worker switcher + status */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 sm:px-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Studio</span>
          <span className="h-4 w-px bg-border" />
          <WorkerSwitcher workers={workers} activeId={worker.id} />
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${status.cls}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${status.pulse ? "animate-pulse" : ""}`} />
            {status.label}
          </span>
        </div>

        {/* three panels — the canvas dominates */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)_22rem]">
          <aside className="hidden min-h-0 flex-col border-r border-border bg-card/40 lg:flex">
            <ZoneLabel>Build</ZoneLabel>
            <div className="min-h-0 flex-1">
              <BuildPanel worker={worker} />
            </div>
          </aside>

          <main className="relative min-h-0 bg-background">
            <WorkerCanvas worker={worker} tasks={tasks} executions={executions} events={events} running={running} />
          </main>

          <aside className="hidden min-h-0 flex-col border-l border-border bg-card/40 lg:flex">
            <div className="min-h-0 flex-1">
              <LiveOutputsPanel worker={worker} outputs={outputs} executions={executions} running={running} />
            </div>
          </aside>
        </div>
      </div>
    </StudioShell>
  )
}

function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-border px-4 py-2.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">{children}</span>
    </div>
  )
}

function WorkerSwitcher({ workers, activeId }: { workers: ReturnType<typeof useWorkforce>["workers"]; activeId: string }) {
  const [open, setOpen] = useState(false)
  const active = workers.find((w) => w.id === activeId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-bold text-white"
          style={{ backgroundColor: active?.identity.accent || "#5a6ef0" }}
        >
          {active?.identity.initials || "?"}
        </span>
        {active?.identity.name || "Unnamed worker"}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <ul className="max-h-72 overflow-y-auto py-1">
              {workers.map((w) => (
                <li key={w.id}>
                  <button
                    onClick={() => {
                      workforceStore.selectWorker(w.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-secondary ${
                      w.id === activeId ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                      style={{ backgroundColor: w.identity.accent || "#5a6ef0" }}
                    >
                      {w.identity.initials || "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{w.identity.name || "Unnamed worker"}</span>
                    {(w.status === "live" || w.status === "working" || w.status === "idle") && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-grow" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                workforceStore.createDraftWorker()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[13px] font-medium text-primary hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> New worker
            </button>
          </div>
        </>
      )}
    </div>
  )
}

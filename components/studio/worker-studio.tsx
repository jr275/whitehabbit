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

import { ChevronDown, Loader2, Plus, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { BuildPanel, type StepKey } from "@/components/studio/build-panel"
import { LiveOutputsPanel } from "@/components/studio/live-outputs-panel"
import { StudioShell } from "@/components/studio/studio-shell"
import { WorkerCanvas } from "@/components/studio/worker-canvas"
import { WorkerAvatar } from "@/components/workforce/worker-avatar"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

export function WorkerStudio({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  // owned here, not inside BuildPanel, so the canvas's capability cards
  // can navigate into a Build step and both panels stay one system —
  // see section 2 of the CEO demo readiness brief.
  const [activeStep, setActiveStep] = useState<StepKey>("identity")
  const { hydrated, workers, activeWorkerId, tasks, executions, outputs, events, creatingWorker, loadingExample, notice } = useWorkforce()
  const searchParams = useSearchParams()
  const requestedWorkerId = searchParams.get("worker")
  const appliedRequestedWorkerId = useRef<string | null>(null)

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  // A deep link like /studio?worker=<id> (e.g. straight from Assemble
  // Worker on the homepage) must land on that exact real worker, not
  // whichever one hydrate() defaulted to (workers[0]). Applied once
  // hydration actually contains it — a newly-created worker may arrive
  // a beat after the redirect if hydrate() and the create request race.
  useEffect(() => {
    if (!hydrated || !requestedWorkerId) return
    if (appliedRequestedWorkerId.current === requestedWorkerId) return
    if (!workers.some((w) => w.id === requestedWorkerId)) return
    workforceStore.selectWorker(requestedWorkerId)
    appliedRequestedWorkerId.current = requestedWorkerId
  }, [hydrated, requestedWorkerId, workers])

  if (!hydrated) {
    return (
      <StudioShell runtimeMode={runtimeMode}>
        <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Loading studio…</span>
        </div>
      </StudioShell>
    )
  }

  const worker = workers.find((w) => w.id === activeWorkerId) ?? workers[0]

  if (!worker) {
    return (
      <StudioShell runtimeMode={runtimeMode}>
        <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-4 text-center">
          <p className="text-[15px] text-muted-foreground">No worker yet.</p>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => workforceStore.createDraftWorker()}
              disabled={creatingWorker}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingWorker ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creatingWorker ? "Creating…" : "Create a worker"}
            </button>
            <button
              onClick={() => workforceStore.loadExampleWorker()}
              disabled={loadingExample}
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingExample && <Loader2 className="h-4 w-4 animate-spin" />}
              {loadingExample ? "Loading…" : "Load an example worker"}
            </button>
          </div>
          {notice && <Notice text={notice} />}
        </div>
      </StudioShell>
    )
  }

  const running = workforceStore.isRunning(worker.id)

  return (
    <StudioShell runtimeMode={runtimeMode}>
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
        {/* studio sub-header — just the worker switcher. The one
         * authoritative worker state lives in the canvas, directly
         * above Run Worker, where it actually matters — see
         * computeWorkerState() in lib/workforce/selectors.ts. */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 sm:px-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Studio</span>
          <span className="h-4 w-px bg-border" />
          <WorkerSwitcher workers={workers} activeId={worker.id} />
        </div>

        {notice && (
          <div className="shrink-0 border-b border-border px-4 py-2 sm:px-6">
            <Notice text={notice} />
          </div>
        )}

        {/* three panels — the canvas dominates */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)_22rem]">
          <aside className="hidden min-h-0 flex-col border-r border-border bg-card/40 lg:flex">
            <ZoneLabel>Build</ZoneLabel>
            <div className="min-h-0 flex-1">
              <BuildPanel worker={worker} activeStep={activeStep} onStepChange={setActiveStep} />
            </div>
          </aside>

          <main className="relative min-h-0 bg-background">
            <WorkerCanvas
              worker={worker}
              tasks={tasks}
              executions={executions}
              events={events}
              outputs={outputs}
              running={running}
              activeStep={activeStep}
              onNavigateToStep={setActiveStep}
            />
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

/** A real, dismissible surface for workforceStore's existing `notice`
 * field — persist/run/delete/create failures already set it; this is
 * the first place anything actually renders it. Not a toast: static,
 * inline, stays until dismissed or replaced by the next real notice. */
function Notice({ text }: { text: string }) {
  return (
    <div className="mx-auto flex max-w-xl items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-left">
      <p className="flex-1 text-[12px] leading-relaxed text-foreground">{text}</p>
      <button onClick={() => workforceStore.dismissNotice()} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function WorkerSwitcher({ workers, activeId }: { workers: ReturnType<typeof useWorkforce>["workers"]; activeId: string }) {
  const [open, setOpen] = useState(false)
  const { creatingWorker } = useWorkforce()
  const active = workers.find((w) => w.id === activeId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
      >
        {active ? <WorkerAvatar worker={active} size="xs" /> : <span className="flex h-5 w-5 items-center justify-center rounded-md bg-secondary text-[9px] font-bold text-muted-foreground">?</span>}
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
                    <WorkerAvatar worker={w} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{w.identity.name || "Unnamed worker"}</span>
                    {w.releasedVersionId != null && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-grow" />}
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={async () => {
                await workforceStore.createDraftWorker()
                setOpen(false)
              }}
              disabled={creatingWorker}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[13px] font-medium text-primary transition-opacity hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingWorker ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {creatingWorker ? "Creating…" : "New worker"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

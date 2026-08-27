"use client"

import { ArrowRight, ChevronDown, Loader2, PanelLeft, PanelRight, Plus, Sparkles, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { BuildPanel, type StepKey } from "@/components/studio/build-panel"
import { LiveOutputsPanel } from "@/components/studio/live-outputs-panel"
import { StudioShell } from "@/components/studio/studio-shell"
import { WorkerCanvas } from "@/components/studio/worker-canvas"
import { WorkerAvatar } from "@/components/workforce/worker-avatar"
import { AUTONOMY_LEVEL_META, autonomyLevelFor } from "@/lib/workforce/catalog"
import type { Worker } from "@/lib/workforce/model"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"
import { agentHealth } from "@/lib/workforce/agent-identity"

const WORKER_STATUS_LABEL: Record<Worker["status"], string> = { draft: "Draft", building: "Building", ready: "Ready", live: "Active" }

const STEP_KEYS: StepKey[] = ["identity", "mission", "skills", "knowledge", "tools", "memory", "behavior", "channels", "output", "evolution"]

const EXAMPLES = [
  "Research high-intent enterprise accounts and brief my sales team",
  "Monitor our market and turn emerging trends into content opportunities",
  "Qualify inbound leads and prepare evidence-backed follow-up briefs",
]

export function WorkerStudio({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const [activeStep, setActiveStep] = useState<StepKey>("identity")
  const [showAssembler, setShowAssembler] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<"builder" | "activity" | null>(null)
  const { hydrated, workers, activeWorkerId, tasks, executions, outputs, events, creatingWorker, notice } = useWorkforce()
  const searchParams = useSearchParams()
  const requestedWorkerId = searchParams.get("worker")
  const requestedStep = searchParams.get("step")
  const appliedRequestedWorkerId = useRef<string | null>(null)

  useEffect(() => { workforceStore.hydrate() }, [])
  useEffect(() => {
    if (requestedStep && STEP_KEYS.includes(requestedStep as StepKey)) setActiveStep(requestedStep as StepKey)
  }, [requestedStep])
  useEffect(() => {
    if (!hydrated || !requestedWorkerId || appliedRequestedWorkerId.current === requestedWorkerId) return
    if (!workers.some((worker) => worker.id === requestedWorkerId)) return
    workforceStore.selectWorker(requestedWorkerId)
    appliedRequestedWorkerId.current = requestedWorkerId
  }, [hydrated, requestedWorkerId, workers])

  if (!hydrated) {
    return <StudioShell runtimeMode={runtimeMode}><div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /><span className="sr-only">Loading studio</span></div></StudioShell>
  }

  const worker = workers.find((item) => item.id === activeWorkerId) ?? workers[0]
  if (!worker) {
    return <StudioShell runtimeMode={runtimeMode}><MagicStart creating={creatingWorker} notice={notice} onComplete={() => setShowAssembler(false)} /></StudioShell>
  }

  const running = workforceStore.isRunning(worker.id)
  const health = agentHealth(worker)
  const workerExecutions = executions.filter((execution) => execution.workerId === worker.id)
  const workerOutputs = outputs.filter((output) => output.workerId === worker.id)
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
        {/* WORKER HEADER — Phase UX-2, on the --ref-* tokens Phase UX-1's
         * Skill Card established. See worker-canvas.tsx's own header
         * comment for why this and the center document move together
         * while the side rails stay as they are for now. */}
        <header className="shrink-0 border-b border-ref-hairline bg-ref-paper px-4 py-4 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <WorkerSwitcher workers={workers} activeId={worker.id} onAssemble={() => setShowAssembler(true)} />
                <StatusPill worker={worker} running={running} />
              </div>
              {worker.mission.trim() && <p className="mt-2 max-w-xl truncate text-[12.5px] text-ref-ink-muted">{worker.mission}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => setMobilePanel("builder")} className="flex size-9 items-center justify-center rounded-[2px] border border-ref-hairline text-ref-ink-muted lg:hidden" aria-label="Open builder"><PanelLeft className="size-4" /></button>
              <button onClick={() => setMobilePanel("activity")} className="flex size-9 items-center justify-center rounded-[2px] border border-ref-hairline text-ref-ink-muted lg:hidden" aria-label="Open activity"><PanelRight className="size-4" /></button>
              <button onClick={() => setShowAssembler(true)} className="hidden items-center gap-2 rounded-[2px] border border-ref-hairline px-3 py-2 text-xs font-medium text-ref-ink-muted transition-colors hover:border-ref-ink/30 hover:text-ref-ink sm:flex"><Sparkles className="size-3.5 text-ref-accent" />Assemble another</button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <HeaderStat label="Autonomy" value={AUTONOMY_LEVEL_META[autonomyLevelFor(worker.autonomy)].label} />
            <HeaderStat label="Skills" value={String(health.enabledSkills)} />
            <HeaderStat label="Tools" value={`${health.connectedTools}/${health.requiredTools}`} />
            <HeaderStat label="Policies" value={String(worker.behaviors.length)} />
            <HeaderStat label="Readiness" value={`${health.readiness}%`} />
            <HeaderStat label="Runs" value={String(workerExecutions.length)} />
            <HeaderStat label="Outputs" value={String(workerOutputs.length)} />
          </div>
        </header>
        {notice && <div className="shrink-0 border-b border-ref-hairline bg-ref-paper px-4 py-2 sm:px-8"><Notice text={notice} /></div>}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)_20rem] xl:grid-cols-[19rem_minmax(0,1fr)_22rem]">
          <aside className="hidden min-h-0 flex-col border-r border-border bg-card/60 lg:flex"><ZoneLabel>Configure</ZoneLabel><div className="min-h-0 flex-1"><BuildPanel worker={worker} activeStep={activeStep} onStepChange={setActiveStep} /></div></aside>
          <main className="relative min-h-0 bg-background"><WorkerCanvas worker={worker} tasks={tasks} executions={executions} events={events} outputs={outputs} running={running} activeStep={activeStep} onNavigateToStep={setActiveStep} /></main>
          <aside className="hidden min-h-0 flex-col border-l border-border bg-card/60 lg:flex"><div className="min-h-0 flex-1"><LiveOutputsPanel worker={worker} outputs={outputs} executions={executions} running={running} /></div></aside>
        </div>
      </div>
      {showAssembler && <div className="fixed inset-0 z-50 overflow-y-auto bg-background/90 p-4 backdrop-blur-sm"><button className="fixed right-5 top-5 studio-icon-button" onClick={() => setShowAssembler(false)} aria-label="Close assembly"><X /></button><MagicStart creating={creatingWorker} notice={notice} compact onComplete={() => setShowAssembler(false)} /></div>}
      {mobilePanel && <div className="fixed inset-0 z-50 bg-background"><div className="flex h-14 items-center justify-between border-b border-border px-4"><span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{mobilePanel === "builder" ? "Configure worker" : "Activity & outputs"}</span><button className="studio-icon-button" onClick={() => setMobilePanel(null)} aria-label="Close panel"><X /></button></div><div className="h-[calc(100dvh-3.5rem)]">{mobilePanel === "builder" ? <BuildPanel worker={worker} activeStep={activeStep} onStepChange={setActiveStep} /> : <LiveOutputsPanel worker={worker} outputs={outputs} executions={executions} running={running} />}</div></div>}
    </StudioShell>
  )
}

function MagicStart({ creating, notice, compact = false, onComplete }: { creating: boolean; notice: string | null; compact?: boolean; onComplete: () => void }) {
  const [objective, setObjective] = useState("")
  const assemble = async () => {
    if (!objective.trim() || creating) return
    const id = await workforceStore.assembleWorker(objective)
    if (id) onComplete()
  }
  return (
    <main className={`mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-5xl items-center px-5 py-16 ${compact ? "min-h-[calc(100dvh-2rem)]" : ""}`}>
      <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <section>
          <div className="mb-8 flex items-center gap-2"><span className="size-2 rounded-full bg-primary shadow-[0_0_14px_hsl(var(--primary))]" /><span className="font-mono text-[10px] uppercase tracking-[0.28em] text-primary">Objective → Worker</span></div>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-6xl">What outcome should your workforce own?</h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">Describe the business result. Menlo Whitehabbit will assemble a persistent worker with the right mission, capabilities, tools, and measurable output.</p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-background">
            <label htmlFor="worker-objective" className="sr-only">Worker objective</label>
            <textarea id="worker-objective" value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={500} placeholder="Example: Research enterprise accounts showing buying intent and give my sales team a ranked, evidence-backed brief every morning." className="min-h-40 w-full resize-none bg-transparent px-5 py-5 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60" />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"><span className="font-mono text-[10px] text-muted-foreground">{objective.length}/500</span><div className="flex items-center gap-2"><button onClick={async () => { const id = await workforceStore.createDraftWorker(); if (id) onComplete() }} disabled={creating} className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Start from scratch</button><button onClick={assemble} disabled={creating || !objective.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40">{creating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{creating ? "Assembling" : "Assemble Worker"}<ArrowRight className="size-4" /></button></div></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">{EXAMPLES.map((example) => <button key={example} onClick={() => setObjective(example)} className="rounded-full border border-border px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">{example}</button>)}</div>
          {notice && <div className="mt-5"><Notice text={notice} /></div>}
        </section>
        <aside className="rounded-2xl border border-border bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Assembly request</p>
          <div className="mt-5 flex items-start gap-3">{creating ? <Loader2 className="mt-0.5 size-5 animate-spin text-primary" /> : <span className="mt-1 size-2 rounded-full bg-muted-foreground" />}<div><p className="text-sm font-medium text-foreground">{creating ? "Assembling your worker" : "Ready when you are"}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{creating ? "Your objective was sent to the server. This view will update when the request completes." : "No backend progress is implied until you submit an objective."}</p></div></div>
        </aside>
      </div>
    </main>
  )
}

function HeaderStat({ label, value }: { label: string; value: string }) { return <div className="flex items-center gap-1.5"><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ref-ink-muted">{label}</span><span className="font-mono text-[11px] font-medium text-ref-ink">{value}</span></div> }
function StatusPill({ worker, running }: { worker: Worker; running: boolean }) {
  const label = running ? "Running" : WORKER_STATUS_LABEL[worker.status]
  const tone = running ? "text-ref-accent" : worker.status === "live" ? "text-ref-ink" : "text-ref-ink-muted"
  return <span className={`inline-flex items-center gap-1.5 rounded-[2px] border border-ref-hairline px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] ${tone}`}><span className={`size-1.5 rounded-full ${running ? "animate-pulse bg-ref-accent" : worker.status === "live" ? "bg-ref-ink" : "bg-ref-ink-muted"}`} />{label}</span>
}
function ZoneLabel({ children }: { children: React.ReactNode }) { return <div className="shrink-0 border-b border-border px-4 py-2.5"><span className="font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">{children}</span></div> }
function Notice({ text }: { text: string }) { return <div className="mx-auto flex max-w-xl items-start gap-2 rounded-[3px] border border-ref-warn/40 bg-ref-warn-soft px-3 py-2 text-left"><p className="flex-1 text-xs leading-relaxed text-ref-ink">{text}</p><button onClick={() => workforceStore.dismissNotice()} className="shrink-0 text-ref-ink-muted hover:text-ref-ink" aria-label="Dismiss notice"><X className="size-3.5" /></button></div> }
function WorkerSwitcher({ workers, activeId, onAssemble }: { workers: ReturnType<typeof useWorkforce>["workers"]; activeId: string; onAssemble: () => void }) {
  const [open, setOpen] = useState(false); const { creatingWorker } = useWorkforce(); const active = workers.find((worker) => worker.id === activeId)
  return <div className="relative"><button onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-[2px] border border-ref-hairline px-2.5 py-1.5 text-[15px] font-semibold text-ref-ink hover:border-ref-ink/30" aria-expanded={open}>{active && <WorkerAvatar worker={active} size="xs" />}<span className="max-w-56 truncate">{active?.identity.name || "Unnamed worker"}</span><ChevronDown className="size-3.5 text-ref-ink-muted" aria-hidden /></button>{open && <><button className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} aria-label="Close worker menu" /><div className="absolute left-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-[3px] border border-ref-hairline bg-ref-paper shadow-lg"><ul className="max-h-72 overflow-y-auto py-1">{workers.map((worker) => <li key={worker.id}><button onClick={() => { workforceStore.selectWorker(worker.id); setOpen(false) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ref-ink-muted hover:text-ref-ink"><WorkerAvatar worker={worker} size="xs" /><span className="min-w-0 flex-1 truncate">{worker.identity.name || "Unnamed worker"}</span>{worker.releasedVersionId && <span className="size-1.5 rounded-full bg-ref-accent" />}</button></li>)}</ul><button onClick={() => { onAssemble(); setOpen(false) }} className="flex w-full items-center gap-2 border-t border-ref-hairline px-3 py-2.5 text-left text-sm font-medium text-ref-accent hover:bg-ref-accent-soft"><Sparkles className="size-3.5" />Assemble from objective</button><button onClick={async () => { await workforceStore.createDraftWorker(); setOpen(false) }} disabled={creatingWorker} className="flex w-full items-center gap-2 border-t border-ref-hairline px-3 py-2.5 text-left text-sm text-ref-ink-muted hover:text-ref-ink"><Plus className="size-3.5" />Blank worker</button></div></>}</div>
}

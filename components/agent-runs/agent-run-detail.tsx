"use client"

/* Agent Run Inspection (§27) + a real visual workflow graph (§28) —
 * driven entirely by the persisted WorkflowRun/WorkflowStep rows.
 * Color reflects real execution state, never a decorative animation:
 * gray = queued, primary accent = running, green = succeeded,
 * red = failed, yellow = waiting/retrying/paused. Cancel/Pause/Resume/
 * Retry (§29) call the real Agent Control Center API. */

import { useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, CircleDashed, Clock3, Pause, Play, RotateCcw, XCircle } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { WorkflowRun, WorkflowStep } from "@/lib/workflow/types"

const STEP_TONE: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  succeeded: { icon: CheckCircle2, className: "text-grow border-grow/30 bg-grow/10" },
  running: { icon: Clock3, className: "text-primary border-primary/30 bg-primary/10" },
  failed: { icon: XCircle, className: "text-destructive border-destructive/30 bg-destructive/10" },
  retrying: { icon: RotateCcw, className: "text-warn border-warn/30 bg-warn/10" },
  skipped: { icon: CircleDashed, className: "text-warn border-warn/30 bg-warn/10" },
  queued: { icon: CircleDashed, className: "text-muted-foreground border-border bg-card" },
}

const RUN_TONE: Record<string, string> = {
  queued: "text-muted-foreground",
  running: "text-primary",
  waiting: "text-primary",
  paused: "text-warn",
  waiting_approval: "text-warn",
  retrying: "text-warn",
  succeeded: "text-grow",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
  timed_out: "text-destructive",
}

const ACTIONABLE: Record<string, ("cancel" | "pause" | "resume" | "retry")[]> = {
  queued: ["cancel"],
  running: ["pause", "cancel"],
  waiting: ["cancel"],
  paused: ["resume", "cancel"],
  waiting_approval: ["cancel"],
  retrying: ["cancel"],
  failed: ["retry"],
  timed_out: ["retry"],
}

export function AgentRunDetail({ id }: { id: string }) {
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorkflowStep | null>(null)
  const [acting, setActing] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/agent-runs/${id}`)
      if (!res.ok) throw new Error("Agent run not found.")
      const data = await res.json()
      setRun(data.run)
      setSteps(data.steps)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agent run.")
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  async function act(action: "cancel" | "pause" | "resume" | "retry") {
    setActing(true)
    try {
      const res = await fetch(`/api/v1/workflows/${id}/${action}`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Action failed.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setActing(false)
    }
  }

  if (error) {
    return (
      <Shell>
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4" /> {error}</div>
      </Shell>
    )
  }
  if (!run) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading…</div>
      </Shell>
    )
  }

  const actions = ACTIONABLE[run.status] ?? []

  return (
    <Shell>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{run.pipeline.replaceAll("_", " ")}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Agent run <span className={`ml-2 font-mono text-sm uppercase ${RUN_TONE[run.status] ?? ""}`}>{run.status.replaceAll("_", " ")}</span>
        </h1>
        <div className="flex gap-2">
          {actions.includes("pause") && <ActionButton icon={Pause} label="Pause" onClick={() => act("pause")} disabled={acting} />}
          {actions.includes("resume") && <ActionButton icon={Play} label="Resume" onClick={() => act("resume")} disabled={acting} />}
          {actions.includes("retry") && <ActionButton icon={RotateCcw} label="Retry" onClick={() => act("retry")} disabled={acting} />}
          {actions.includes("cancel") && <ActionButton icon={XCircle} label="Cancel" onClick={() => act("cancel")} disabled={acting} tone="destructive" />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <Field label="Attempts" value={`${run.attemptCount}/${run.maxAttempts}`} />
        <Field label="Duration" value={run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"} />
        <Field label="Model" value={run.model ?? "—"} />
        <Field label="Cost" value={run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : run.usage?.costUsd ? `$${run.usage.costUsd.toFixed(4)}` : "—"} />
      </div>
      {run.errorReason && <p className="mt-3 text-sm text-destructive">{run.errorReason}</p>}
      {run.checkpoint?.lastCompletedStep && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Last checkpoint: {run.checkpoint.lastCompletedStep} (step {run.checkpoint.lastCompletedSequence})</p>
      )}

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Timeline</h2>
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step) => {
          const tone = STEP_TONE[step.status] ?? STEP_TONE.queued
          const Icon = tone.icon
          return (
            <li key={step.id}>
              <button onClick={() => setSelected(step)} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${tone.className} ${selected?.id === step.id ? "ring-1 ring-primary" : ""}`}>
                <span className="flex items-center gap-2 text-sm font-medium capitalize">
                  <Icon className="size-4 shrink-0" /> {step.step.replaceAll("_", " ")}
                  {step.attemptCount > 1 && <span className="font-mono text-[9px] text-muted-foreground">×{step.attemptCount}</span>}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em]">{step.durationMs != null ? `${step.durationMs}ms` : step.status}</span>
              </button>
            </li>
          )
        })}
        {steps.length === 0 && <li className="text-sm text-muted-foreground">No steps recorded yet.</li>}
      </ol>

      {selected && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{selected.step.replaceAll("_", " ")} — input/output</p>
          {selected.error && <p className="mt-2 text-sm text-destructive">{selected.error}</p>}
          <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-background/60 p-3 text-xs text-foreground/90">
            {JSON.stringify({ input: selected.input, output: selected.output, checkpointData: selected.checkpointData }, null, 2)}
          </pre>
        </section>
      )}
    </Shell>
  )
}

function ActionButton({ icon: Icon, label, onClick, disabled, tone = "default" }: { icon: typeof Pause; label: string; onClick: () => void; disabled: boolean; tone?: "default" | "destructive" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        tone === "destructive" ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20" : "border-border bg-secondary/40 text-foreground hover:bg-secondary"
      }`}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[800px] px-5 py-8 sm:px-8">{children}</main>
    </div>
  )
}

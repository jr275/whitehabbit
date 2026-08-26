"use client"

/* Agent Run Inspection (§27) + a real visual workflow graph (§28) —
 * driven entirely by the persisted agent_run/agent_run_steps rows.
 * Color reflects real execution state, never a decorative animation:
 * gray = queued, primary accent = running, green = completed,
 * red = failed, yellow = skipped/waiting. */

import { useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, CircleDashed, Clock3, XCircle } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { AgentRun, AgentRunStep } from "@/lib/agent-runs/model"

const STEP_TONE: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  completed: { icon: CheckCircle2, className: "text-grow border-grow/30 bg-grow/10" },
  running: { icon: Clock3, className: "text-primary border-primary/30 bg-primary/10" },
  failed: { icon: XCircle, className: "text-destructive border-destructive/30 bg-destructive/10" },
  skipped: { icon: CircleDashed, className: "text-warn border-warn/30 bg-warn/10" },
  queued: { icon: CircleDashed, className: "text-muted-foreground border-border bg-card" },
}

export function AgentRunDetail({ id }: { id: string }) {
  const [run, setRun] = useState<AgentRun | null>(null)
  const [steps, setSteps] = useState<AgentRunStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AgentRunStep | null>(null)

  useEffect(() => {
    fetch(`/api/agent-runs/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Agent run not found.")
        return res.json()
      })
      .then((data) => {
        setRun(data.run)
        setSteps(data.steps)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load agent run."))
  }, [id])

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

  return (
    <Shell>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{run.pipeline.replaceAll("_", " ")}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Agent run</h1>
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <Field label="Status" value={run.status.replaceAll("_", " ")} />
        <Field label="Duration" value={run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"} />
        <Field label="Model" value={run.model ?? "—"} />
        <Field label="Cost" value={run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : "—"} />
      </div>
      {run.errorReason && <p className="mt-3 text-sm text-destructive">{run.errorReason}</p>}

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
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em]">{step.durationMs != null ? `${step.durationMs}ms` : step.status}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {selected && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{selected.step.replaceAll("_", " ")} — input/output</p>
          {selected.error && <p className="mt-2 text-sm text-destructive">{selected.error}</p>}
          <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-background/60 p-3 text-xs text-foreground/90">
            {JSON.stringify({ input: selected.input, output: selected.output }, null, 2)}
          </pre>
        </section>
      )}
    </Shell>
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

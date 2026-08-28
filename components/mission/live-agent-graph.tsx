"use client"

/* Live Agent Graph (Phase 8, §10, ADR-046) — real, currently-active
 * WorkflowRuns for this tenant, each rendered as its own real pipeline-
 * stage sequence (the exact step order lib/content-pipeline/steps.ts
 * and lib/website-discovery/steps.ts already define — never an
 * invented generic stage list). A step's color is real state
 * (succeeded/current/pending/failed), read from the run's own real
 * checkpoint — never decorative animation with no underlying state
 * change (§10: "use animation ONLY when a real state transition
 * occurs"). Refetches on an interval (a real, honest choice — see
 * ADR-046 for why this is a poll, not a new tenant-wide SSE stream). */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Clock3, CircleAlert } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { WorkflowRun, WorkflowPipeline } from "@/lib/workflow/types"

const STEP_SEQUENCE: Record<WorkflowPipeline, string[]> = {
  website_discovery: ["crawl", "extract_entities", "build_profile", "discover_opportunities"],
  content_generation: ["research", "information_gain_gate", "outline", "draft", "seo", "geo", "quality", "decide_publish"],
  trend_analysis: ["trend_to_opportunity"],
  decision_execution: ["decision_to_opportunity"],
}

const ACTIVE_STATUSES = ["queued", "running", "waiting", "paused", "waiting_approval", "retrying"]
const REFRESH_MS = 5_000

function StepChip({ label, state }: { label: string; state: "succeeded" | "current" | "pending" | "failed" }) {
  const tone =
    state === "succeeded" ? "border-grow/40 bg-grow/10 text-grow" :
    state === "current" ? "border-primary/50 bg-primary/15 text-primary animate-pulse" :
    state === "failed" ? "border-destructive/40 bg-destructive/10 text-destructive" :
    "border-border bg-card text-muted-foreground"
  return <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] ${tone}`}>{label.replaceAll("_", " ")}</span>
}

function RunRow({ run }: { run: WorkflowRun }) {
  const steps = STEP_SEQUENCE[run.pipeline] ?? []
  const lastCompleted = run.checkpoint?.lastCompletedSequence ?? 0
  return (
    <Link href={`/agent-runs/${run.id}`} className="block rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">{run.pipeline.replaceAll("_", " ")}</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{run.subjectType} · {run.subjectId.slice(0, 20)}</p>
        </div>
        <span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${run.status === "running" ? "text-primary" : run.status === "waiting_approval" ? "text-warn" : "text-muted-foreground"}`}>{run.status.replaceAll("_", " ")}</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto">
        {steps.map((step, i) => {
          const seq = i + 1
          const state = seq <= lastCompleted ? "succeeded" : seq === lastCompleted + 1 && run.status === "running" ? "current" : run.status === "failed" && seq === lastCompleted + 1 ? "failed" : "pending"
          return <StepChip key={step} label={step} state={state} />
        })}
      </div>
    </Link>
  )
}

export function LiveAgentGraph() {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const results = await Promise.all(ACTIVE_STATUSES.map((status) => fetch(`/api/v1/workflows?status=${status}`).then((r) => (r.ok ? r.json() : { workflows: [] }))))
      const all = results.flatMap((r) => r.workflows as WorkflowRun[])
      all.sort((a, b) => b.createdAt - a.createdAt)
      setRuns(all)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load live agent runs.")
    }
  }

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Live Agent Graph</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">What agents are doing right now</h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">Every real, currently-active workflow run for this tenant — refreshed every {REFRESH_MS / 1000}s. Click a run for its full inspector.</p>
        </header>

        {error && <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" /> {error}</div>}

        <div className="mt-8 flex flex-col gap-3">
          {runs === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading real active runs…</div>
          ) : runs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">No real agent runs are active right now — nothing queued, running, or waiting.</p>
          ) : (
            runs.map((run) => <RunRow key={run.id} run={run} />)
          )}
        </div>
      </main>
    </div>
  )
}

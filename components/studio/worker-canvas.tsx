"use client"

/* ------------------------------------------------------------------ *
 * WORKER CANVAS (center zone) — the living worker, structurally.
 * Not a node editor: the worker's skill categories, how ready it is,
 * and — the moment you click Run Worker — real, watchable execution
 * streams. This is the hero of Studio.
 * ------------------------------------------------------------------ */

import { Loader2, Play } from "lucide-react"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import { SKILL_CATEGORIES, SKILL_CATEGORY_LABEL, type SkillCategory, type Worker, type WorkerExecution } from "@/lib/workforce/model"
import { computeReadiness } from "@/lib/workforce/selectors"
import { workforceStore } from "@/lib/workforce/store"

const CATEGORY_HINT: Record<SkillCategory, string> = {
  research: "Finds and verifies signal",
  content: "Writes and creates",
  communication: "Replies and converses",
  sales: "Scores and advances pipeline",
}

export function WorkerCanvas({
  worker,
  executions,
  running,
}: {
  worker: Worker
  executions: WorkerExecution[]
  running: boolean
}) {
  const readiness = computeReadiness(worker)
  const released = worker.status !== "draft"
  const canRun = released && !running && worker.skills.some((s) => s.enabled)
  const activeExecutions = executions.filter((e) => e.workerId === worker.id && e.status === "running")

  return (
    <div className="flex h-full flex-col">
      <div className="thin-scroll-light flex-1 overflow-y-auto px-6 py-8 sm:px-10">
        {/* worker header */}
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"
            style={{ backgroundColor: worker.identity.accent || "#5a6ef0" }}
          >
            {worker.identity.initials || "NW"}
          </span>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-foreground">
            {worker.identity.name || "Unnamed worker"}
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {worker.identity.role || "No role set"}
          </p>
        </div>

        {/* skill category rail */}
        <div className="relative mx-auto mt-10 max-w-xl">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SKILL_CATEGORIES.map((cat) => {
              const skills = worker.skills.filter((s) => s.category === cat)
              const enabledCount = skills.filter((s) => s.enabled).length
              const categoryTaskTitles = new Set(
                skills.filter((s) => s.enabled).map((s) => SKILL_CATALOG.find((t) => t.id === s.id)?.taskTitle),
              )
              const streamActive = activeExecutions.some((e) => categoryTaskTitles.has(e.label))
              return (
                <div
                  key={cat}
                  className={`rounded-xl border px-3 py-4 text-center transition-colors ${
                    enabledCount > 0 ? "border-primary/25 bg-primary/[0.04]" : "border-border bg-card"
                  } ${streamActive ? "ring-2 ring-primary/40" : ""}`}
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {SKILL_CATEGORY_LABEL[cat]}
                  </div>
                  <div className={`mt-1.5 text-[20px] font-semibold tabular-nums ${enabledCount > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                    {enabledCount}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{CATEGORY_HINT[cat]}</div>
                </div>
              )
            })}
          </div>
          <div className="mx-auto mt-3 h-4 w-px bg-border" />
          <div className="mx-auto w-fit rounded-full border border-border bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Execution
          </div>
        </div>

        {/* readiness */}
        <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground">Worker readiness</span>
            <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{readiness.percent}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${readiness.percent}%` }} />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-3">
            {readiness.steps.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2">
                <dt className="text-[11.5px] text-muted-foreground">{s.label}</dt>
                <dd className={`font-mono text-[11px] ${s.done ? "text-grow" : "text-muted-foreground/50"}`}>{s.done ? "✓" : "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* live execution streams */}
        {activeExecutions.length > 0 && (
          <div className="mx-auto mt-6 max-w-xl rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {worker.identity.name} is working…
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {activeExecutions.map((e) => (
                <div key={e.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] text-foreground">{e.label}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {e.done} / {e.target}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${e.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!released && (
          <p className="mx-auto mt-6 max-w-xs text-center text-[12px] leading-relaxed text-muted-foreground">
            Build through the steps on the left, then release {worker.identity.name || "the worker"} to run it.
          </p>
        )}
      </div>

      {/* run worker */}
      <div className="border-t border-border bg-card/60 p-4">
        <button
          onClick={() => workforceStore.runWorker(worker.id)}
          disabled={!canRun}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Working…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Run Worker
            </>
          )}
        </button>
      </div>
    </div>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WORKER CANVAS (center zone) — the living worker, structurally.
 * Not a node editor: the worker's skill categories, how ready it is,
 * and — the moment you click Run Worker — the real execution stage as
 * it actually happens (not a fake percentage tick).
 * ------------------------------------------------------------------ */

import { AlertTriangle, KeyRound, Loader2, Play, XCircle } from "lucide-react"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import { SKILL_CATEGORIES, SKILL_CATEGORY_LABEL, type SkillCategory, type Worker, type WorkerEvent, type WorkerExecution, type WorkerTask } from "@/lib/workforce/model"
import { activeWork, computeReadiness, credentialBlockers, workerCredentialState } from "@/lib/workforce/selectors"
import { workforceStore } from "@/lib/workforce/store"

const CATEGORY_HINT: Record<SkillCategory, string> = {
  research: "Finds and verifies real signal",
  content: "Analyzes what's actually working",
  communication: "Reads real audience response",
  sales: "Scores and advances pipeline",
}

interface FinishedRunResult {
  icon: typeof KeyRound
  title: string
  detail: string
}

/** Translates a real, structured execution outcome into the exact copy
 * the UI shows — never a generic "something went wrong". */
function describeFinishedRun(worker: Worker, task: WorkerTask, execution: WorkerExecution): FinishedRunResult {
  if (execution.status === "blocked") {
    const blocker = credentialBlockers(worker).find((b) => b.skillId === task.skillId)
    return { icon: KeyRound, title: blocker?.title ?? "Credential required", detail: blocker?.detail ?? execution.blockedReason ?? "A required credential is not configured." }
  }
  switch (execution.reasonCode) {
    case "invalid_credential":
      return { icon: KeyRound, title: "The configured API key was rejected", detail: execution.blockedReason ?? "Check the credential and try again." }
    case "provider_error":
      return { icon: AlertTriangle, title: "A tool call failed", detail: execution.blockedReason ?? "The external service did not respond successfully." }
    default:
      return { icon: XCircle, title: "The run failed", detail: execution.blockedReason ?? "See the execution timeline in Outputs Hub for details." }
  }
}

export function WorkerCanvas({
  worker,
  tasks,
  executions,
  events,
  running,
}: {
  worker: Worker
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  events: WorkerEvent[]
  running: boolean
}) {
  const readiness = computeReadiness(worker)
  const released = worker.status !== "draft"
  // a real blocker is shown as context, not a reason to prevent the
  // attempt — running anyway is how the user sees the real, honest
  // BLOCKED state instead of being told about it secondhand.
  const canRun = released && !running && worker.skills.some((s) => s.enabled)
  const active = activeWork([worker], executions, tasks, events).filter((a) => a.workerId === worker.id)
  const credentialState = workerCredentialState(worker)

  // the most recent finished (not running) execution for this worker —
  // used only to surface a real blocked/failed result right after a
  // Run Worker click; a completed run is already shown in Live Outputs.
  const lastExecution = executions
    .filter((e) => e.workerId === worker.id && e.status !== "running")
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  const lastTask = lastExecution ? tasks.find((t) => t.id === lastExecution.taskId) : undefined
  const lastResult =
    active.length === 0 && lastExecution && lastTask && (lastExecution.status === "blocked" || lastExecution.status === "failed")
      ? describeFinishedRun(worker, lastTask, lastExecution)
      : null

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
              const catSkills = worker.skills.filter((s) => s.category === cat)
              const enabledCount = catSkills.filter((s) => s.enabled).length
              const streamActive = active.some((a) => catSkills.some((s) => s.enabled && SKILL_CATALOG.find((t) => t.id === s.id)?.taskTitle === a.taskTitle))
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
          {readiness.blockers.length > 0 && (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2">
              <p className="font-mono text-[9.5px] uppercase tracking-wider text-warn">Cannot run</p>
              {readiness.blockers.map((b) => (
                <p key={b} className="mt-1 text-[11.5px] text-foreground">
                  {b}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* live execution — the real stage, not a fake percentage */}
        {active.length > 0 && (
          <div className="mx-auto mt-6 max-w-xl rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {worker.identity.name} is working…
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {active.map((a) => (
                <div key={a.executionId} className="flex items-center justify-between">
                  <div>
                    <p className="text-[12.5px] text-foreground">{a.taskTitle}</p>
                    <p className="text-[11px] text-muted-foreground">{a.stage}</p>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{a.elapsedSeconds}s</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* last run result — the structured, honest outcome of the most
         * recent click, shown until a new run replaces it */}
        {lastResult && (
          <div className="mx-auto mt-6 max-w-xl rounded-xl border border-warn/30 bg-warn/5 p-4">
            <div className="flex items-start gap-2.5">
              <lastResult.icon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <div>
                <p className="text-[13.5px] font-medium text-foreground">{lastResult.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{lastResult.detail}</p>
              </div>
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
        {released && (
          <div className="mb-2.5 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className={`h-1.5 w-1.5 rounded-full ${credentialState === "ready" ? "bg-grow" : "bg-warn"}`} />
            <span className={credentialState === "ready" ? "text-grow" : "text-warn"}>{credentialState === "ready" ? "Ready" : "Not configured"}</span>
          </div>
        )}
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

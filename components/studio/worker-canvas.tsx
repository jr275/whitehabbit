"use client"

/* ------------------------------------------------------------------ *
 * WORKER CANVAS (center zone) — the visual center of WhiteHabbit.
 *
 * Answers two questions immediately, from real data only:
 *   "What is this Worker capable of?"  -> the capability cross
 *   "What is this Worker doing?"       -> the execution zone
 *
 * The capability cross is a spatial arrangement (Skills/Tools/
 * Knowledge/Behavior around a Worker Core), not a node graph — there
 * are no edges, no decorative connectors, nothing that isn't real
 * worker data. It's also a real navigation surface: each card opens
 * the matching Build step (see onNavigateToStep) — "I see what this
 * Worker can do -> I click it -> I configure it."
 *
 * The execution zone reuses the exact same real event-derived stage
 * list (buildExecutionStages) whether a run is currently in progress
 * or already finished, so "live" and "history" are one real code
 * path, not two. Above it sits the ONE authoritative worker state
 * (computeWorkerState) — no second status indicator exists elsewhere.
 * ------------------------------------------------------------------ */

import { AlertTriangle, BookOpen, Check, KeyRound, Layers, ListChecks, Loader2, Play, ShieldAlert, Wrench, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import type { StepKey } from "@/components/studio/build-panel"
import { ExecutionTimeline } from "@/components/outputs/output-drawer"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import { toolExecutionBoundary, TOOL_BOUNDARY_META, type Worker, type WorkerEvent, type WorkerExecution, type WorkerOutput, type WorkerTask } from "@/lib/workforce/model"
import {
  activeWork,
  buildExecutionStages,
  computeReadiness,
  computeWorkerState,
  credentialBlockers,
  todaysTimeline,
  WORKER_STATE_META,
} from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

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
  if (execution.status === "pending_approval") {
    return { icon: ShieldAlert, title: "Waiting on human approval", detail: execution.blockedReason ?? "This action requires approval before it can run." }
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

/** Which capability category a Build step belongs to — connects the
 * canvas's real save-flash to the real category the store just
 * confirmed persisted (see SaveCategory in lib/workforce/store.ts). */
const STEP_SAVE_CATEGORY: Partial<Record<StepKey, string>> = {
  skills: "skills",
  tools: "tools",
  knowledge: "knowledge",
  behavior: "behavior",
}

export function WorkerCanvas({
  worker,
  tasks,
  executions,
  events,
  outputs,
  running,
  activeStep,
  onNavigateToStep,
}: {
  worker: Worker
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  events: WorkerEvent[]
  outputs: WorkerOutput[]
  running: boolean
  activeStep: StepKey
  onNavigateToStep: (step: StepKey) => void
}) {
  const { lastSaved } = useWorkforce()
  const readiness = computeReadiness(worker)
  const released = worker.status !== "draft"
  // a real blocker is shown as context, not a reason to prevent the
  // attempt — running anyway is how the user sees the real, honest
  // BLOCKED state instead of being told about it secondhand.
  const canRun = released && !running && worker.skills.some((s) => s.enabled)
  const active = activeWork([worker], executions, tasks, events).filter((a) => a.workerId === worker.id)
  const overallState = computeWorkerState(worker, executions, running)
  const stateMeta = WORKER_STATE_META[overallState]

  // the currently running execution (if any) and the most recently
  // finished one — the execution zone shows one real state at a time:
  // live progression while running, the last real outcome once it isn't.
  const runningExecution = executions.find((e) => e.workerId === worker.id && e.status === "running")
  const lastExecution = executions
    .filter((e) => e.workerId === worker.id && e.status !== "running")
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  const lastTask = lastExecution ? tasks.find((t) => t.id === lastExecution.taskId) : undefined
  const lastOutput = lastExecution ? outputs.find((o) => o.executionId === lastExecution.id) : undefined
  const lastResult =
    active.length === 0 && lastExecution && lastTask && (lastExecution.status === "blocked" || lastExecution.status === "failed" || lastExecution.status === "pending_approval")
      ? describeFinishedRun(worker, lastTask, lastExecution)
      : null

  const liveStages = runningExecution ? buildExecutionStages(runningExecution, events) : null

  // real recent history for this worker — shown only once idle, never
  // fabricated, and only when there's actually something to show.
  const recent = todaysTimeline([worker], executions, tasks, outputs)
    .filter((t) => t.workerId === worker.id)
    .slice(0, 4)

  // a brief, real acknowledgement that a Build edit actually persisted
  // — only fires once the store confirms a real successful PATCH (see
  // lastSaved in store.ts), never on keystroke, never faked.
  const [flashCategory, setFlashCategory] = useState<string | null>(null)
  useEffect(() => {
    if (!lastSaved || lastSaved.workerId !== worker.id) return
    setFlashCategory(lastSaved.category)
    const t = setTimeout(() => setFlashCategory(null), 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSaved?.at, lastSaved?.workerId])

  return (
    <div className="flex h-full flex-col">
      <div className="thin-scroll-light flex-1 overflow-y-auto px-6 py-8 sm:px-10">
        {/* worker header */}
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm"
            style={{ backgroundColor: worker.identity.accent || "#5a6ef0" }}
          >
            {worker.identity.initials || "NW"}
          </span>
          <h1 className="mt-3 text-[20px] font-semibold tracking-tight text-foreground">{worker.identity.name || "Unnamed worker"}</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{worker.identity.role || "No role set"}</p>
          {worker.mission.trim() && <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">{worker.mission}</p>}
        </div>

        {/* capability cross — Worker Core surrounded by its real
         * capabilities, and a real navigation surface into Build. */}
        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-2.5 lg:grid-cols-3 lg:[grid-template-rows:auto_auto_auto]">
          <CapabilityCard
            className="lg:col-start-2 lg:row-start-1"
            icon={Layers}
            label="Skills"
            items={worker.skills.filter((s) => s.enabled).map((s) => SKILL_CATALOG.find((t) => t.id === s.id)?.name ?? s.name)}
            empty="No skills enabled"
            executing={active.length > 0}
            selected={activeStep === "skills"}
            flash={flashCategory === STEP_SAVE_CATEGORY.skills}
            onClick={() => onNavigateToStep("skills")}
          />
          <ToolsCapabilityCard
            className="lg:col-start-1 lg:row-start-2"
            worker={worker}
            selected={activeStep === "tools"}
            flash={flashCategory === STEP_SAVE_CATEGORY.tools}
            onClick={() => onNavigateToStep("tools")}
          />
          <div className="lg:col-start-2 lg:row-start-2 rounded-xl border border-primary/25 bg-primary/[0.03] p-4 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Worker readiness</p>
            <p className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-foreground">{readiness.percent}%</p>
            <div className="mx-auto mt-2 h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${readiness.percent}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-left">
              {readiness.steps.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-1.5">
                  <dt className="truncate text-[10.5px] text-muted-foreground">{s.label}</dt>
                  <dd className={`shrink-0 font-mono text-[10px] ${s.done ? "text-grow" : "text-muted-foreground/50"}`}>{s.done ? "✓" : "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <CapabilityCard
            className="lg:col-start-3 lg:row-start-2"
            icon={BookOpen}
            label="Knowledge"
            items={worker.knowledge.map((k) => k.name)}
            empty="No knowledge sources"
            selected={activeStep === "knowledge"}
            flash={flashCategory === STEP_SAVE_CATEGORY.knowledge}
            onClick={() => onNavigateToStep("knowledge")}
          />
          <CapabilityCard
            className="lg:col-start-2 lg:row-start-3"
            icon={ListChecks}
            label="Behavior"
            items={worker.behaviors.map((b) => `IF ${b.condition} → ${b.action}`)}
            empty="No behavior rules set"
            selected={activeStep === "behavior"}
            flash={flashCategory === STEP_SAVE_CATEGORY.behavior}
            onClick={() => onNavigateToStep("behavior")}
          />
        </div>

        {readiness.blockers.length > 0 && (
          <div className="mx-auto mt-4 max-w-xl rounded-lg border border-warn/30 bg-warn/5 px-3 py-2">
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-warn">Cannot run</p>
            {readiness.blockers.map((b) => (
              <p key={b} className="mt-1 text-[11.5px] text-foreground">
                {b}
              </p>
            ))}
          </div>
        )}

        {/* execution zone — one real state at a time: live progression,
         * the last real outcome, or real recent history when idle. */}
        <div className="mx-auto mt-6 max-w-xl">
          {liveStages ? (
            <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running
                </span>
                {active[0] && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{active[0].elapsedSeconds}s</span>}
              </div>
              <div className="mt-3">
                <ExecutionTimeline stages={liveStages} />
              </div>
            </div>
          ) : lastResult ? (
            <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
              <div className="flex items-start gap-2.5">
                <lastResult.icon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <div>
                  <p className="text-[13.5px] font-medium text-foreground">{lastResult.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{lastResult.detail}</p>
                </div>
              </div>
            </div>
          ) : lastExecution && lastExecution.status === "completed" ? (
            <div className="rounded-xl border border-grow/25 bg-grow/[0.03] p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-grow">
                <Check className="h-3 w-3" /> Last run completed
              </div>
              {lastExecution && (
                <div className="mt-2">
                  <ExecutionTimeline stages={buildExecutionStages(lastExecution, events, lastOutput)} />
                </div>
              )}
            </div>
          ) : recent.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Recent activity</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {recent.map((r) => (
                  <p key={r.id} className={`text-[11.5px] leading-relaxed ${r.tone === "bad" ? "text-destructive" : r.tone === "warn" ? "text-warn" : "text-foreground"}`}>
                    {r.text}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
              {released ? "No executions yet. Run this worker to see its real activity here." : `Build through the steps on the left, then release ${worker.identity.name || "the worker"} to run it.`}
            </p>
          )}
        </div>
      </div>

      {/* run worker — the ONE authoritative worker state, and the
       * action that visually derives from it */}
      <div className="border-t border-border bg-card/60 p-4">
        {released && (
          <div className="mb-2.5 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stateMeta.tone === "good" ? "bg-grow" : stateMeta.tone === "bad" ? "bg-destructive" : stateMeta.tone === "info" ? "bg-primary" : "bg-warn"
              } ${overallState === "running" ? "animate-pulse" : ""}`}
            />
            <span
              className={
                stateMeta.tone === "good" ? "text-grow" : stateMeta.tone === "bad" ? "text-destructive" : stateMeta.tone === "info" ? "text-primary" : "text-warn"
              }
            >
              {stateMeta.label}
            </span>
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

function cardToneClass(selected: boolean, flash: boolean, executing: boolean): string {
  if (executing) return "border-primary/40 ring-1 ring-primary/25"
  if (flash) return "border-primary bg-primary/[0.04]"
  if (selected) return "border-primary/50"
  return "border-border hover:border-primary/30"
}

function CapabilityCard({
  className = "",
  icon: Icon,
  label,
  items,
  empty,
  executing = false,
  selected = false,
  flash = false,
  onClick,
}: {
  className?: string
  icon: typeof Layers
  label: string
  items: string[]
  empty: string
  executing?: boolean
  selected?: boolean
  flash?: boolean
  onClick?: () => void
}) {
  const shown = items.slice(0, 3)
  const extra = items.length - shown.length
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border bg-card p-3.5 text-left transition-colors ${cardToneClass(selected, flash, executing)} ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/70">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[11px] italic text-muted-foreground/70">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {shown.map((it) => (
            <li key={it} className="truncate text-[11.5px] text-foreground">
              {it}
            </li>
          ))}
          {extra > 0 && <li className="text-[10.5px] text-muted-foreground">+{extra} more</li>}
        </ul>
      )}
    </button>
  )
}

function ToolsCapabilityCard({
  worker,
  className = "",
  selected = false,
  flash = false,
  onClick,
}: {
  worker: Worker
  className?: string
  selected?: boolean
  flash?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border bg-card p-3.5 text-left transition-colors ${cardToneClass(selected, flash, false)} ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">Tools</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/70">{worker.tools.length}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {worker.tools.map((t) => {
          const boundary = toolExecutionBoundary(t)
          const meta = TOOL_BOUNDARY_META[boundary]
          const dot = meta.tone === "good" ? "bg-grow" : meta.tone === "warn" ? "bg-warn" : "bg-muted-foreground/30"
          return (
            <li key={t.id} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              <span className="truncate text-[11.5px] text-foreground">{t.name}</span>
            </li>
          )
        })}
      </ul>
    </button>
  )
}

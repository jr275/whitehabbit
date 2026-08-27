/* ================================================================== *
 * SELECTORS — pure read-side projections over the real ledger the
 * server returns. Every number here is computed from actual Task /
 * Execution / Output / Metric rows — never a hand-typed KPI.
 * ================================================================== */

import { SKILL_CATALOG, TOOL_CATALOG } from "./catalog"
import { formatBusinessValue } from "./business-results"
import type { DataProvenance, EconomicState, EconomicValueCategory, MetricRecord, Skill, Worker, WorkerEvent, WorkerEventType, WorkerExecution, WorkerOutput, WorkerTask } from "./model"
import { ECONOMIC_VALUE_CATEGORY_LABEL, OUTPUT_TYPE_META } from "./model"
import { getWorkerVisual } from "./visual-identity"

/* ---- readiness (Studio) — real, and it names the real blocker ---- */
export interface ReadinessStep {
  key: string
  label: string
  done: boolean
  detail: string
}

export function computeReadiness(worker: Worker): { steps: ReadinessStep[]; percent: number; blockers: string[] } {
  const enabledSkills = worker.skills.filter((s) => s.enabled)
  const connectedTools = worker.tools.filter((t) => t.connected).length

  const steps: ReadinessStep[] = [
    { key: "identity", label: "Identity", done: !!worker.identity.name.trim() && !!worker.identity.role.trim(), detail: worker.identity.name ? `${worker.identity.name} · ${worker.identity.role || "—"}` : "Not set" },
    { key: "mission", label: "Mission", done: !!worker.mission.trim(), detail: worker.mission.trim() ? `${worker.objectives.length} objective${worker.objectives.length === 1 ? "" : "s"}` : "Not set" },
    { key: "skills", label: "Skills", done: enabledSkills.length > 0, detail: `${enabledSkills.length} configured` },
    { key: "tools", label: "Tools", done: connectedTools > 0, detail: `${connectedTools}/${worker.tools.length} connected` },
    { key: "knowledge", label: "Knowledge", done: worker.knowledge.length > 0, detail: `${worker.knowledge.length} source${worker.knowledge.length === 1 ? "" : "s"}` },
    { key: "permissions", label: "Permissions", done: worker.behaviors.length > 0, detail: `${worker.behaviors.length} rule${worker.behaviors.length === 1 ? "" : "s"}` },
    { key: "outcome", label: "Outcome", done: !!worker.outcome.primaryKPI, detail: worker.outcome.primaryKPI || "Not set" },
  ]

  const blockers = credentialBlockers(worker).map((b) => `${b.skillName} needs ${b.toolName} — ${b.detail}`)

  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
  return { steps, percent, blockers: Array.from(new Set(blockers)) }
}

/* ---- credential state — the worker's explicit READY / NOT_CONFIGURED
 * state (section 3). Computed the same way everywhere a tool's real
 * `connected` flag matters, so the readiness card, the canvas, and the
 * Live Outputs empty state can never drift from each other. ---- */
export interface CredentialBlocker {
  skillId: string
  skillName: string
  toolId: string
  toolName: string
  /** what the UI shows as the headline, e.g. "Anthropic API key required" */
  title: string
  /** what the UI shows as the explanation, e.g. "Configure ANTHROPIC_API_KEY to run this worker." */
  detail: string
}

export function credentialBlockers(worker: Worker): CredentialBlocker[] {
  const out: CredentialBlocker[] = []
  for (const skill of worker.skills.filter((s) => s.enabled)) {
    const template = SKILL_CATALOG.find((s) => s.id === skill.id)
    if (!template) continue
    for (const toolId of template.requiredTools) {
      const tool = worker.tools.find((t) => t.id === toolId)
      if (!tool || tool.connected) continue
      out.push({
        skillId: skill.id,
        skillName: skill.name,
        toolId: tool.id,
        toolName: tool.name,
        // tool.provider is live-hydrated server-side (see lib/agent/
        // hydrate.ts) — for tool_llm it reflects whichever provider
        // LLM_PROVIDER actually selected, so this never says "Anthropic"
        // when Gemini is configured, or vice versa.
        title: tool.id === "tool_llm" ? `${tool.provider} API key required` : `${tool.name} not connected`,
        detail: tool.notConnectedReason ?? `Connect ${tool.name} to run this worker.`,
      })
    }
  }
  return out
}

export type WorkerCredentialState = "ready" | "not_configured"

export function workerCredentialState(worker: Worker): WorkerCredentialState {
  const hasEnabledSkill = worker.skills.some((s) => s.enabled)
  if (!hasEnabledSkill) return "not_configured"
  return credentialBlockers(worker).length === 0 ? "ready" : "not_configured"
}

/* ---- ONE authoritative worker state — replaces the previous two
 * separate indicators (a header lifecycle pill and a footer credential
 * badge, which could disagree). Priority order matters: a worker can
 * simultaneously be "released" and "missing a credential" — that's
 * shown as not_configured, since that's what actually blocks the next
 * click. Real execution history only ever refines "ready" into
 * "completed"/"failed" once there's something real to report. ---- */
export type WorkerOverallState = "draft" | "not_configured" | "ready" | "running" | "completed" | "failed"

export const WORKER_STATE_META: Record<WorkerOverallState, { label: string; tone: "muted" | "warn" | "info" | "good" | "bad" }> = {
  draft: { label: "Draft", tone: "muted" },
  not_configured: { label: "Not configured", tone: "warn" },
  ready: { label: "Ready", tone: "good" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
}

export function computeWorkerState(worker: Worker, executions: WorkerExecution[], running: boolean): WorkerOverallState {
  if (worker.status === "draft") return "draft"
  if (running) return "running"
  if (workerCredentialState(worker) === "not_configured") return "not_configured"
  const last = executions.filter((e) => e.workerId === worker.id && e.status !== "running").sort((a, b) => b.startedAt - a.startedAt)[0]
  if (!last) return "ready"
  // blocked/failed/pending_approval all coarsen to "failed" at this
  // single-badge level — the real distinction is still shown in full
  // right below it (describeFinishedRun / the execution timeline).
  return last.status === "completed" ? "completed" : "failed"
}

/* ---- time helpers ---- */
export function isToday(ts: number): boolean {
  const d = new Date(ts)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export function timeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

/* ---- today's work, per worker ---- */
export interface TypeCount {
  type: string
  count: number
  label: string
}

export function todaysOutputsForWorker(workerId: string, outputs: WorkerOutput[]): WorkerOutput[] {
  return outputs.filter((o) => o.workerId === workerId && isToday(o.createdAt))
}

export function todaysWorkByType(workerId: string, outputs: WorkerOutput[]): TypeCount[] {
  const today = todaysOutputsForWorker(workerId, outputs)
  const counts = new Map<string, number>()
  for (const o of today) counts.set(o.type, (counts.get(o.type) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, label: OUTPUT_TYPE_META[type]?.plural ?? type }))
    .sort((a, b) => b.count - a.count)
}

export interface WorkerTaskSummary {
  tasks: number
  completed: number
  failed: number
  blocked: number
  pendingApproval: number
  quality: number | null
}

export function workerTaskSummary(workerId: string, tasks: WorkerTask[], outputs: WorkerOutput[]): WorkerTaskSummary {
  const todaysTasks = tasks.filter((t) => t.workerId === workerId && isToday(t.createdAt))
  const today = todaysOutputsForWorker(workerId, outputs)
  const quality = today.length ? Math.round(today.reduce((s, o) => s + (o.qualityScore ?? 0), 0) / today.length) : null
  return {
    tasks: todaysTasks.length,
    completed: todaysTasks.filter((t) => t.status === "completed").length,
    failed: todaysTasks.filter((t) => t.status === "failed").length,
    blocked: todaysTasks.filter((t) => t.status === "blocked").length,
    pendingApproval: todaysTasks.filter((t) => t.status === "pending_approval").length,
    quality,
  }
}

/* ---- active work: "Workers Working Now" — real stage, real elapsed time ---- */
export interface ActiveWorkItem {
  workerId: string
  workerName: string
  accent: string
  taskTitle: string
  stage: string
  elapsedSeconds: number
  executionId: string
}

const STAGE_LABEL: Record<string, string> = {
  task_started: "Starting…",
  skill_started: "Planning…",
  tool_called: "Calling a tool…",
  tool_completed: "Tool responded",
  reasoning_started: "Analyzing with the LLM…",
  reasoning_completed: "Analysis complete",
  output_created: "Writing the result…",
  metric_recorded: "Recording metrics…",
}

export function activeWork(workers: Worker[], executions: WorkerExecution[], tasks: WorkerTask[], events: WorkerEvent[]): ActiveWorkItem[] {
  const running = executions.filter((e) => e.status === "running")
  return running
    .map((e) => {
      const worker = workers.find((w) => w.id === e.workerId)
      const task = tasks.find((t) => t.id === e.taskId)
      if (!worker || !task) return null
      const latestEvent = events.filter((ev) => ev.executionId === e.id).sort((a, b) => b.timestamp - a.timestamp)[0]
      return {
        workerId: e.workerId,
        workerName: worker.identity.name,
        accent: getWorkerVisual(worker).accent,
        taskTitle: task.title,
        stage: latestEvent ? (STAGE_LABEL[latestEvent.type] ?? latestEvent.type) : "Starting…",
        elapsedSeconds: Math.round((Date.now() - e.startedAt) / 1000),
        executionId: e.id,
      }
    })
    .filter((x): x is ActiveWorkItem => x !== null)
}

/* ---- post-run stage-by-stage breakdown — built purely from the real
 * events persisted for one execution (see lib/db/repo.ts's events read).
 * A stage a run never reached is "pending", never fabricated as done;
 * the stage where a real failure happened is "failed" with the real
 * reason. Durations/token counts come straight from the same event
 * payloads the live stream already used — nothing here is re-estimated. ---- */
export interface ExecutionStageStep {
  key: string
  label: string
  status: "done" | "failed" | "pending"
  detail?: string
  timestamp?: number
  durationMs?: number
}

export function buildExecutionStages(execution: WorkerExecution, events: WorkerEvent[], output?: WorkerOutput): ExecutionStageStep[] {
  const own = events.filter((e) => e.executionId === execution.id).sort((a, b) => a.timestamp - b.timestamp)
  const byType = (t: WorkerEventType) => own.filter((e) => e.type === t)
  const steps: ExecutionStageStep[] = []

  const started = byType("task_started")[0]
  steps.push({ key: "started", label: "Started", status: started ? "done" : "pending", timestamp: started?.timestamp ?? execution.startedAt })

  const toolCompleted = byType("tool_completed")[0]
  const toolBlocked = byType("tool_blocked")[0]
  const toolCalled = byType("tool_called")[0]
  if (toolCompleted) {
    const p = toolCompleted.payload as { resultCount?: number; durationMs?: number }
    steps.push({
      key: "search",
      label: "Search",
      status: "done",
      detail: p.resultCount != null ? `${p.resultCount} real result${p.resultCount === 1 ? "" : "s"}` : undefined,
      timestamp: toolCompleted.timestamp,
      durationMs: typeof p.durationMs === "number" ? p.durationMs : undefined,
    })
  } else if (toolBlocked) {
    steps.push({ key: "search", label: "Search", status: "failed", detail: String((toolBlocked.payload as { reason?: string }).reason ?? "Tool blocked"), timestamp: toolBlocked.timestamp })
  } else {
    steps.push({ key: "search", label: "Search", status: "pending", timestamp: toolCalled?.timestamp })
  }

  const reasoningCompleted = byType("reasoning_completed")[0]
  const reasoningStarted = byType("reasoning_started")[0]
  if (reasoningCompleted) {
    const p = reasoningCompleted.payload as { durationMs?: number; inputTokens?: number; outputTokens?: number; executionMode?: string }
    steps.push({
      key: "reasoning",
      label: "Reasoning",
      status: "done",
      detail: p.executionMode === "development" ? "Development fixture — no external LLM called" : p.inputTokens != null ? `${p.inputTokens} in / ${p.outputTokens ?? 0} out tokens` : undefined,
      timestamp: reasoningCompleted.timestamp,
      durationMs: typeof p.durationMs === "number" ? p.durationMs : undefined,
    })
  } else {
    steps.push({ key: "reasoning", label: "Reasoning", status: "pending", timestamp: reasoningStarted?.timestamp })
  }

  const outputCreated = byType("output_created")[0]
  steps.push({
    key: "output",
    label: "Output",
    status: outputCreated ? "done" : "pending",
    detail: outputCreated ? String((outputCreated.payload as { title?: string }).title ?? "") : undefined,
    timestamp: outputCreated?.timestamp,
  })

  steps.push({
    key: "evaluation",
    label: "Evaluation",
    status: output?.evaluation ? "done" : "pending",
    detail: output?.evaluation ? `Quality ${output.qualityScore ?? "—"}%` : undefined,
    // evaluate() runs synchronously right before the output is persisted
    // and emitted — there is no separate timed event for it, so this
    // honestly shares output_created's real timestamp rather than
    // inventing a distinct one.
    timestamp: outputCreated?.timestamp,
  })

  const done = byType("task_completed")[0]
  const failed = byType("task_failed")[0]
  const blocked = byType("task_blocked")[0]
  const approval = byType("approval_required")[0]
  const final = done ?? failed ?? blocked ?? approval
  if (final) {
    const good = final.type === "task_completed"
    steps.push({
      key: "completed",
      label: good ? "Completed" : final.type === "approval_required" ? "Pending approval" : final.type === "task_blocked" ? "Blocked" : "Failed",
      status: good ? "done" : "failed",
      detail: !good ? String((final.payload as { reason?: string }).reason ?? execution.blockedReason ?? "") : undefined,
      timestamp: final.timestamp,
    })
  } else {
    steps.push({ key: "completed", label: "Completed", status: "pending" })
  }

  return steps
}

/* ---- today's activity timeline — real outcomes, not fake ticks ---- */
export interface TimelineEntry {
  id: string
  ts: number
  workerId: string
  workerName: string
  accent: string
  text: string
  executionId: string
  tone: "good" | "warn" | "bad"
}

export function todaysTimeline(workers: Worker[], executions: WorkerExecution[], tasks: WorkerTask[], outputs: WorkerOutput[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const e of executions) {
    if (e.status === "running" || !e.completedAt || !isToday(e.completedAt)) continue
    const worker = workers.find((w) => w.id === e.workerId)
    const task = tasks.find((t) => t.id === e.taskId)
    if (!worker || !task) continue

    let text: string
    let tone: TimelineEntry["tone"] = "good"
    if (e.status === "completed") {
      const output = outputs.find((o) => o.executionId === e.id)
      text = output
        ? `${worker.identity.name} completed "${task.title}" — quality ${output.qualityScore ?? "—"}%`
        : `${worker.identity.name} completed "${task.title}"`
    } else if (e.status === "blocked") {
      text = `${worker.identity.name} — "${task.title}" blocked: ${e.blockedReason ?? "a required tool is not connected"}`
      tone = "warn"
    } else if (e.status === "pending_approval") {
      text = `${worker.identity.name} — "${task.title}" waiting on approval: ${e.blockedReason ?? "requires human approval"}`
      tone = "warn"
    } else {
      text = `${worker.identity.name} — "${task.title}" failed: ${e.blockedReason ?? "unknown error"}`
      tone = "bad"
    }

    entries.push({ id: e.id, ts: e.completedAt, workerId: worker.id, workerName: worker.identity.name, accent: getWorkerVisual(worker).accent, text, executionId: e.id, tone })
  }
  return entries.sort((a, b) => b.ts - a.ts)
}

/* ---- header metrics (Outputs Hub) — operational, real ---- */
export interface HeaderMetrics {
  tasksCompleted: number
  outputsProduced: number
  successRate: number
  blockedTasks: number
  failedTasks: number
  /** null = at least one LLM call happened today but no provider rate
   * was configured for it — genuinely unavailable, never rendered as
   * $0 (which would claim it cost nothing). 0 only when nothing that
   * consumed tokens ran today at all. */
  totalCostUsd: number | null
}

export function headerMetrics(tasks: WorkerTask[], executions: WorkerExecution[], outputs: WorkerOutput[]): HeaderMetrics {
  const todaysTasks = tasks.filter((t) => isToday(t.createdAt))
  const todaysOutputs = outputs.filter((o) => isToday(o.createdAt))
  const todaysExecutions = executions.filter((e) => e.completedAt && isToday(e.completedAt))
  const completed = todaysTasks.filter((t) => t.status === "completed").length
  const failed = todaysTasks.filter((t) => t.status === "failed").length
  const blocked = todaysTasks.filter((t) => t.status === "blocked").length
  const finished = completed + failed + blocked
  const successRate = finished ? Math.round((completed / finished) * 1000) / 10 : 100

  const costBearing = todaysExecutions.filter((e) => e.inputTokens != null)
  const costed = costBearing.filter((e) => e.costUsd != null)
  const totalCostUsd = costBearing.length === 0 ? 0 : costed.length === 0 ? null : costed.reduce((s, e) => s + (e.costUsd ?? 0), 0)

  return { tasksCompleted: completed, outputsProduced: todaysOutputs.length, successRate, blockedTasks: blocked, failedTasks: failed, totalCostUsd }
}

/* ---- real operational totals, e.g. "sources analyzed" ---- */
export function sumMetric(metrics: MetricRecord[], workerId: string, key: string): number {
  return metrics.filter((m) => m.workerId === workerId && m.key === key).reduce((s, m) => s + m.value, 0)
}

/* ================================================================== *
 * SKILL CARD — the real projection behind components/skills/skill-
 * card.tsx. Every field here is resolved from real data or explicitly
 * left absent; nothing is invented to make a card look complete.
 * "Business value" prefers a REAL, executed business metric (with its
 * real economicState) over the skill's merely-declared valueCategories
 * — a real $ number that actually ran outranks a semantic description
 * of what the skill is designed to do, the moment one exists.
 * ================================================================== */
export type ConfidenceLabel = "High" | "Moderate" | "Low" | "Not yet evaluated"

export interface SkillCardView {
  id: string
  name: string
  description: string
  status?: "active" | "beta" | "deprecated"
  enabled: boolean
  /** Real tool names this skill's own requiredTools resolve to —
   * never a made-up list of "what it needs". */
  needs: string[]
  /** The real OUTPUT_TYPE_META label for what this skill actually
   * produces when it runs. */
  produces: string
  /** Real, formatted business-metric lines if this skill has actually
   * run and emitted one; otherwise the skill's declared (but not yet
   * measured) value categories — visually distinguished by the caller
   * using `hasRealValue`, never presented identically. */
  businessValue: string[]
  hasRealValue: boolean
  riskLevel?: "low" | "medium" | "high" | "critical"
  confidence: { label: ConfidenceLabel; score?: number }
  /** Only present once this skill has actually completed a real run —
   * see docs/financial-domain.md; never inferred for a skill that
   * hasn't executed. */
  provenance?: DataProvenance
  economicState?: EconomicState
}

export function buildSkillCardView(
  skill: Skill,
  worker: Worker,
  tasks: WorkerTask[],
  executions: WorkerExecution[],
  outputs: WorkerOutput[],
  metrics: MetricRecord[],
): SkillCardView {
  const template = SKILL_CATALOG.find((t) => t.id === skill.id)
  const needs = (template?.requiredTools ?? []).map((toolId) => TOOL_CATALOG.find((t) => t.id === toolId)?.name ?? toolId)
  const outputType = template?.outputType ?? skill.outputType
  const produces = OUTPUT_TYPE_META[outputType]?.label ?? outputType

  const skillTaskIds = new Set(tasks.filter((t) => t.workerId === worker.id && t.skillId === skill.id).map((t) => t.id))
  const skillExecutions = executions.filter((e) => e.workerId === worker.id && skillTaskIds.has(e.taskId))
  const lastCompleted = skillExecutions.filter((e) => e.status === "completed").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]
  const lastOutput = lastCompleted ? outputs.find((o) => o.executionId === lastCompleted.id) : undefined
  const businessMetrics = lastCompleted ? metrics.filter((m) => m.executionId === lastCompleted.id && m.kind === "business") : []

  const confidence: { label: ConfidenceLabel; score?: number } =
    lastOutput?.qualityScore == null
      ? { label: "Not yet evaluated" }
      : { label: lastOutput.qualityScore >= 80 ? "High" : lastOutput.qualityScore >= 50 ? "Moderate" : "Low", score: lastOutput.qualityScore }

  const hasRealValue = businessMetrics.length > 0
  const businessValue = hasRealValue
    ? businessMetrics.map((m) => `${(m.valueCategory && ECONOMIC_VALUE_CATEGORY_LABEL[m.valueCategory]) ?? m.key}: ${formatBusinessValue(m.value, m.unit ?? "")}`)
    : (template?.valueCategories ?? []).map((c) => ECONOMIC_VALUE_CATEGORY_LABEL[c])

  return {
    id: skill.id,
    name: template?.name ?? skill.name,
    description: template?.description ?? "",
    status: template?.status,
    enabled: skill.enabled,
    needs,
    produces,
    businessValue,
    hasRealValue,
    riskLevel: template?.riskLevel,
    confidence,
    provenance: lastCompleted?.dataProvenance,
    economicState: businessMetrics[0]?.economicState,
  }
}

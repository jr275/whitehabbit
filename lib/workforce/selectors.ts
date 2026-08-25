/* ================================================================== *
 * SELECTORS — pure read-side projections over the real ledger the
 * server returns. Every number here is computed from actual Task /
 * Execution / Output / Metric rows — never a hand-typed KPI.
 * ================================================================== */

import { DOMAIN_METRIC_TAXONOMY } from "./business-events"
import { SKILL_CATALOG } from "./catalog"
import type { BusinessEvent, MetricRecord, Worker, WorkerEvent, WorkerEventType, WorkerExecution, WorkerOutput, WorkerTask } from "./model"
import { OUTPUT_TYPE_META } from "./model"
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
  const blockers = credentialBlockers(worker)

  // "Ready to work", not just "configured": Business Objective and
  // Success Metrics reuse the exact same real fields Studio's Mission/
  // Outcome steps already write (worker.mission, worker.outcome) —
  // this is a framing change, not a new data model. Data Connections
  // is the one genuinely new check: are this worker's real
  // credentialBlockers() actually clear right now.
  const steps: ReadinessStep[] = [
    { key: "identity", label: "Identity", done: !!worker.identity.name.trim() && !!worker.identity.role.trim(), detail: worker.identity.name ? `${worker.identity.name} · ${worker.identity.role || "—"}` : "Not set" },
    { key: "mission", label: "Business Objective", done: !!worker.mission.trim(), detail: worker.mission.trim() ? worker.mission.trim() : "Not set" },
    { key: "skills", label: "Skills", done: enabledSkills.length > 0, detail: `${enabledSkills.length} configured` },
    { key: "tools", label: "Tools", done: connectedTools > 0, detail: `${connectedTools}/${worker.tools.length} connected` },
    { key: "knowledge", label: "Knowledge", done: worker.knowledge.length > 0, detail: `${worker.knowledge.length} source${worker.knowledge.length === 1 ? "" : "s"}` },
    { key: "permissions", label: "Permissions", done: worker.behaviors.length > 0, detail: `${worker.behaviors.length} rule${worker.behaviors.length === 1 ? "" : "s"}` },
    { key: "outcome", label: "Success Metrics", done: !!worker.outcome.primaryKPI, detail: worker.outcome.primaryKPI || "Not set" },
    {
      key: "data_connections",
      label: "Data Connections",
      done: blockers.length === 0 && enabledSkills.length > 0,
      detail: blockers.length > 0 ? blockers[0].detail : enabledSkills.length > 0 ? "All required tools connected" : "Enable a skill first",
    },
  ]

  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
  return { steps, percent, blockers: Array.from(new Set(blockers.map((b) => `${b.skillName} needs ${b.toolName} — ${b.detail}`))) }
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
      label: "Researching",
      status: "done",
      detail: p.resultCount != null ? `${p.resultCount} real result${p.resultCount === 1 ? "" : "s"}` : undefined,
      timestamp: toolCompleted.timestamp,
      durationMs: typeof p.durationMs === "number" ? p.durationMs : undefined,
    })
  } else if (toolBlocked) {
    steps.push({ key: "search", label: "Researching", status: "failed", detail: String((toolBlocked.payload as { reason?: string }).reason ?? "Tool blocked"), timestamp: toolBlocked.timestamp })
  } else {
    steps.push({ key: "search", label: "Researching", status: "pending", timestamp: toolCalled?.timestamp })
  }

  const reasoningCompleted = byType("reasoning_completed")[0]
  const reasoningStarted = byType("reasoning_started")[0]
  if (reasoningCompleted) {
    const p = reasoningCompleted.payload as { durationMs?: number; inputTokens?: number; outputTokens?: number; executionMode?: string }
    steps.push({
      key: "reasoning",
      label: "Analyzing",
      status: "done",
      detail: p.executionMode === "development" ? "Development fixture — no external LLM called" : p.inputTokens != null ? `${p.inputTokens} in / ${p.outputTokens ?? 0} out tokens` : undefined,
      timestamp: reasoningCompleted.timestamp,
      durationMs: typeof p.durationMs === "number" ? p.durationMs : undefined,
    })
  } else {
    steps.push({ key: "reasoning", label: "Analyzing", status: "pending", timestamp: reasoningStarted?.timestamp })
  }

  const outputCreated = byType("output_created")[0]
  steps.push({
    key: "output",
    label: "Compiling result",
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
 * BUSINESS IMPACT (Outputs Hub) — turns the REAL, PERSISTED
 * BusinessEvent/MetricRecord rows lib/agent/runtime.ts already writes
 * (see lib/workforce/business-events.ts) into what the product
 * experience shows. Nothing here derives a new number — every value is
 * a real MetricRecord.value already in the ledger; a domain metric this
 * worker has never actually produced is OMITTED, never shown as 0, and
 * a metric this product can't measure at all yet is shown as
 * `not_connected` with a real connect hint — never guessed.
 * ================================================================== */

export type ProvenanceState = "real" | "demo" | "not_connected"

export interface DomainImpactMetric {
  key: string
  label: string
  state: ProvenanceState
  /** null only when state is "not_connected" — never a fabricated 0. */
  value: number | null
  unit?: string
  currency?: string
  connectHint?: string
}

/** Real-world action needed to activate a metric this product genuinely
 * can't measure yet — mirrors the same honest language used in
 * lib/products/catalog.ts's businessOutcomes/notYetConnected. Kept
 * local to this display layer so it can grow with the taxonomy without
 * touching business-events.ts. */
const CONNECT_HINT: Record<string, string> = {
  pipeline_influenced: "Connect your CRM to measure pipeline influenced",
  meetings_booked: "Connect your calendar/CRM to measure meetings booked",
  opportunities_created: "Connect your CRM to measure opportunities created",
  revenue_influenced: "Connect your CRM to measure revenue influenced",
  leads_generated: "Connect your CRM/forms to measure leads generated",
  campaign_revenue: "Connect your ads/CRM platform to measure campaign revenue",
  cac: "Connect your ads platform to measure CAC",
  engagement: "Connect analytics to measure engagement",
  tickets_resolved: "Connect your helpdesk to measure tickets resolved",
  resolution_time: "Connect your helpdesk to measure resolution time",
  csat: "Connect a survey/helpdesk tool to measure CSAT",
  retention: "Connect your billing/CRM system to measure retention",
  tasks_automated: "Connect your operations tooling to measure tasks automated",
  hours_saved: "Connect your operations tooling to measure hours saved",
  errors_avoided: "Connect your operations tooling to measure errors avoided",
  cost_saved: "Connect your operations tooling to measure cost saved",
  invoices_processed: "Connect your accounting system to measure invoices processed",
  cash_recovered: "Connect your accounting system to measure cash recovered",
  reconciliation_accuracy: "Connect your accounting system to measure reconciliation accuracy",
}

/** One Super Agent domain's real Business Impact numbers for one
 * worker. `domainKey` is lib/products/catalog.ts's ProductTemplate.
 * metricDomain — a DOMAIN_METRIC_TAXONOMY key. Real and demo metric
 * rows are never summed together (section 3: "never mix them") — a
 * key with only demo rows shows as `demo`, only real rows as `real`;
 * a key with neither is omitted entirely rather than shown as 0. */
export function domainImpactMetrics(domainKey: string, workerId: string, metrics: MetricRecord[], executions: WorkerExecution[]): DomainImpactMetric[] {
  const defs = DOMAIN_METRIC_TAXONOMY[domainKey] ?? []
  const modeById = new Map(executions.map((e) => [e.id, e.executionMode]))
  const out: DomainImpactMetric[] = []
  for (const def of defs) {
    if (!def.real) {
      out.push({ key: def.key, label: def.label, state: "not_connected", value: null, connectHint: CONNECT_HINT[def.key] ?? `Connect a data source to activate ${def.label.toLowerCase()}` })
      continue
    }
    const rows = metrics.filter((m) => m.workerId === workerId && m.key === def.key && m.kind === "business")
    if (rows.length === 0) continue
    const real = rows.filter((m) => !(m.executionId && modeById.get(m.executionId) === "development"))
    const demo = rows.filter((m) => m.executionId && modeById.get(m.executionId) === "development")
    if (real.length > 0) {
      out.push({ key: def.key, label: def.label, state: "real", value: real.reduce((s, m) => s + m.value, 0), unit: real[0].unit, currency: real[0].currency })
    } else {
      out.push({ key: def.key, label: def.label, state: "demo", value: demo.reduce((s, m) => s + m.value, 0), unit: demo[0].unit, currency: demo[0].currency })
    }
  }
  return out
}

/* ---- plain business language for a technical BusinessEvent — UX
 * principle: the user should never need to know what a BusinessEvent
 * is (section 15). Unmapped types fall back to a humanized version of
 * the real type string, never a made-up phrase. ---- */
const BUSINESS_EVENT_PHRASE: Record<string, (n: number) => string> = {
  lead_qualified: (n) => `${n} lead${n === 1 ? "" : "s"} qualified`,
  content_opportunity_identified: (n) => `${n} content opportunit${n === 1 ? "y" : "ies"} identified`,
  page_opportunity_planned: (n) => `${n} page opportunit${n === 1 ? "y" : "ies"} planned`,
  ticket_resolved: () => "Ticket resolved",
  ticket_escalated: () => "Escalated to a human",
  ticket_flagged: () => "Flagged for review",
}

export function businessEventLabel(type: string, numericValue?: number): string {
  const fn = BUSINESS_EVENT_PHRASE[type]
  if (fn) return fn(numericValue ?? 1)
  return type.replace(/_/g, " ")
}

/** Real provenance label for a BusinessEvent/MetricRecord's `source`
 * field (section 5: "identify whether the source is Worker output,
 * CRM, Web, Email, Other Connector, Demo"). `source` is always either
 * "skill:<id>" (today, every real event) or "connector:<id>" (once a
 * Connection can emit one) — see lib/workforce/model.ts's BusinessEvent
 * doc comment. Never guesses a source that isn't the real string
 * written at insert time. */
export function sourceLabel(source: string | undefined, isDemo: boolean): string {
  if (isDemo) return "Demo"
  if (!source) return "Worker output"
  if (source.startsWith("skill:")) return "Worker output"
  if (source.startsWith("connector:")) return `Connector — ${source.slice("connector:".length)}`
  return source
}

export function resultProvenanceState(execution: WorkerExecution | undefined): "real" | "demo" {
  return execution?.executionMode === "development" ? "demo" : "real"
}

/* ---- multi-worker attribution, honestly scoped to today's real
 * architecture: ONE Worker per Super Agent, with multiple Skills
 * (see the Business Impact brief's "Multi-Worker Architecture Audit").
 * A Skill is the real, distinct unit of contribution that exists today
 * — this groups by skillId, never fabricates a separate Worker that
 * isn't actually provisioned. Contribution is shown as real counts
 * (executions, outputs, the real numericValue of each business event
 * type) — never a financial attribution percentage nothing backs. ---- */
export interface SkillContributionEvent {
  type: string
  label: string
  /** sum of the real BusinessEvent.numericValue across this skill's
   * events of this type — a count, never a fabricated share. */
  count: number
}

export interface SkillContribution {
  skillId: string
  skillName: string
  executions: number
  completedOutputs: number
  events: SkillContributionEvent[]
}

export function workerSkillContribution(workerId: string, tasks: WorkerTask[], outputs: WorkerOutput[], businessEvents: BusinessEvent[]): SkillContribution[] {
  const bySkill = new Map<string, WorkerTask[]>()
  for (const t of tasks) {
    if (t.workerId !== workerId) continue
    if (!bySkill.has(t.skillId)) bySkill.set(t.skillId, [])
    bySkill.get(t.skillId)!.push(t)
  }

  const out: SkillContribution[] = []
  for (const [skillId, skillTasks] of bySkill) {
    const template = SKILL_CATALOG.find((s) => s.id === skillId)
    const taskIds = new Set(skillTasks.map((t) => t.id))
    const skillOutputs = outputs.filter((o) => o.workerId === workerId && taskIds.has(o.taskId))
    const outputIds = new Set(skillOutputs.map((o) => o.id))
    const events = businessEvents.filter((be) => be.workerId === workerId && be.outputId && outputIds.has(be.outputId))

    const totalsByType = new Map<string, number>()
    for (const e of events) totalsByType.set(e.type, (totalsByType.get(e.type) ?? 0) + (e.numericValue ?? 1))

    out.push({
      skillId,
      skillName: template?.name ?? skillId,
      executions: skillTasks.length,
      completedOutputs: skillOutputs.filter((o) => o.status === "completed").length,
      events: Array.from(totalsByType.entries()).map(([type, count]) => ({ type, label: businessEventLabel(type, count), count })),
    })
  }
  return out.sort((a, b) => b.executions - a.executions)
}

/* ---- Result Cards / Provenance — the real chain for one output,
 * assembled from arrays the caller already has (no new fetch, no new
 * table). A card only ever links to a BusinessEvent/MetricRecord that
 * actually exists for this exact output/execution — never a nearby or
 * similar one. ---- */
export interface ResultCardData {
  output: WorkerOutput
  worker: Worker
  task?: WorkerTask
  execution?: WorkerExecution
  businessEvent?: BusinessEvent
  metrics: MetricRecord[]
  isDemo: boolean
}

export function recentResults(
  workers: Worker[],
  tasks: WorkerTask[],
  executions: WorkerExecution[],
  outputs: WorkerOutput[],
  businessEvents: BusinessEvent[],
  metrics: MetricRecord[],
  opts?: { workerId?: string; limit?: number },
): ResultCardData[] {
  const filtered = outputs.filter((o) => o.status === "completed" && (!opts?.workerId || o.workerId === opts.workerId))
  const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt).slice(0, opts?.limit ?? 6)

  const out: ResultCardData[] = []
  for (const o of sorted) {
    const worker = workers.find((w) => w.id === o.workerId)
    if (!worker) continue
    const execution = executions.find((e) => e.id === o.executionId)
    out.push({
      output: o,
      worker,
      task: tasks.find((t) => t.id === o.taskId),
      execution,
      businessEvent: businessEvents.find((be) => be.outputId === o.id),
      metrics: metrics.filter((m) => m.executionId === o.executionId),
      isDemo: execution?.executionMode === "development",
    })
  }
  return out
}

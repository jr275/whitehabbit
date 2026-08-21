/* ================================================================== *
 * SELECTORS — pure read-side projections over the real ledger the
 * server returns. Every number here is computed from actual Task /
 * Execution / Output / Metric rows — never a hand-typed KPI.
 * ================================================================== */

import { SKILL_CATALOG } from "./catalog"
import type { MetricRecord, Worker, WorkerEvent, WorkerExecution, WorkerOutput, WorkerTask } from "./model"
import { OUTPUT_TYPE_META } from "./model"

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

  // the real reason each enabled skill cannot execute right now, if any
  const blockers: string[] = []
  for (const skill of enabledSkills) {
    const template = SKILL_CATALOG.find((s) => s.id === skill.id)
    if (!template) continue
    for (const toolId of template.requiredTools) {
      const tool = worker.tools.find((t) => t.id === toolId)
      if (tool && !tool.connected) {
        blockers.push(`${skill.name} needs ${tool.name}${tool.notConnectedReason ? ` — ${tool.notConnectedReason}` : " (not connected)"}`)
      }
    }
  }

  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
  return { steps, percent, blockers: Array.from(new Set(blockers)) }
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
        accent: worker.identity.accent,
        taskTitle: task.title,
        stage: latestEvent ? (STAGE_LABEL[latestEvent.type] ?? latestEvent.type) : "Starting…",
        elapsedSeconds: Math.round((Date.now() - e.startedAt) / 1000),
        executionId: e.id,
      }
    })
    .filter((x): x is ActiveWorkItem => x !== null)
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
    } else {
      text = `${worker.identity.name} — "${task.title}" failed: ${e.blockedReason ?? "unknown error"}`
      tone = "bad"
    }

    entries.push({ id: e.id, ts: e.completedAt, workerId: worker.id, workerName: worker.identity.name, accent: worker.identity.accent, text, executionId: e.id, tone })
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
  totalCostUsd: number
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
  const totalCostUsd = todaysExecutions.reduce((s, e) => s + (e.costUsd ?? 0), 0)
  return { tasksCompleted: completed, outputsProduced: todaysOutputs.length, successRate, blockedTasks: blocked, failedTasks: failed, totalCostUsd }
}

/* ---- real operational totals, e.g. "sources analyzed" ---- */
export function sumMetric(metrics: MetricRecord[], workerId: string, key: string): number {
  return metrics.filter((m) => m.workerId === workerId && m.key === key).reduce((s, m) => s + m.value, 0)
}

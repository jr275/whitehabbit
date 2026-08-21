/* ================================================================== *
 * SELECTORS — pure read-side projections over the workforce store.
 * Every operational number in Studio + Outputs Hub is computed here
 * from real Task/Execution/Output records — never a hand-typed KPI.
 * ================================================================== */

import { SKILL_CATALOG } from "./catalog"
import type { OutputKind, Worker, WorkerExecution, WorkerOutput, WorkerTask } from "./model"
import { OUTPUT_TYPE_META } from "./model"

/* ---- readiness (Studio) ---- */
export interface ReadinessStep {
  key: string
  label: string
  done: boolean
  detail: string
}

export function computeReadiness(worker: Worker): { steps: ReadinessStep[]; percent: number } {
  const enabledSkills = worker.skills.filter((s) => s.enabled).length
  const connectedTools = worker.tools.filter((t) => t.connected).length
  const connectedChannels = worker.channels.filter((c) => c.connected).length

  const steps: ReadinessStep[] = [
    { key: "identity", label: "Identity", done: !!worker.identity.name.trim() && !!worker.identity.role.trim(), detail: worker.identity.name ? `${worker.identity.name} · ${worker.identity.role || "—"}` : "Not set" },
    { key: "mission", label: "Mission", done: !!worker.mission.trim(), detail: worker.mission.trim() ? `${worker.objectives.length} objective${worker.objectives.length === 1 ? "" : "s"}` : "Not set" },
    { key: "knowledge", label: "Knowledge", done: worker.knowledge.length > 0, detail: `${worker.knowledge.length} source${worker.knowledge.length === 1 ? "" : "s"}` },
    { key: "skills", label: "Skills", done: enabledSkills > 0, detail: `${enabledSkills} configured` },
    { key: "tools", label: "Tools", done: connectedTools > 0, detail: `${connectedTools} available` },
    { key: "behavior", label: "Behavior", done: worker.behaviors.length > 0, detail: `${worker.behaviors.length} rule${worker.behaviors.length === 1 ? "" : "s"}` },
    { key: "channels", label: "Channels", done: connectedChannels > 0, detail: `${connectedChannels} connected` },
    { key: "test", label: "Test", done: worker.tested, detail: worker.tested ? "Passed" : "Not tested" },
    { key: "release", label: "Release", done: worker.status === "live" || worker.status === "working" || worker.status === "idle", detail: worker.releasedAt ? "Live" : "Not released" },
  ]
  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
  return { steps, percent }
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
  type: OutputKind
  count: number
  label: string
}

export function todaysOutputsForWorker(workerId: string, outputs: WorkerOutput[]): WorkerOutput[] {
  return outputs.filter((o) => o.workerId === workerId && isToday(o.createdAt))
}

export function todaysWorkByType(workerId: string, outputs: WorkerOutput[]): TypeCount[] {
  const today = todaysOutputsForWorker(workerId, outputs)
  const counts = new Map<OutputKind, number>()
  for (const o of today) counts.set(o.type, (counts.get(o.type) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, label: OUTPUT_TYPE_META[type].plural }))
    .sort((a, b) => b.count - a.count)
}

export interface WorkerTaskSummary {
  tasks: number
  completed: number
  failed: number
  escalated: number
  quality: number
}

export function workerTaskSummary(workerId: string, tasks: WorkerTask[], outputs: WorkerOutput[]): WorkerTaskSummary {
  const todaysTasks = tasks.filter((t) => t.workerId === workerId && isToday(t.createdAt))
  const today = todaysOutputsForWorker(workerId, outputs)
  const failed = today.filter((o) => o.status === "failed").length
  const escalated = today.filter((o) => o.approval === "pending").length
  const quality = today.length ? Math.round(today.reduce((s, o) => s + (o.qualityScore ?? 0), 0) / today.length) : 0
  return {
    tasks: todaysTasks.length,
    completed: todaysTasks.filter((t) => t.status === "completed").length,
    failed,
    escalated,
    quality,
  }
}

/* ---- active work: "Workers Working Now" ---- */
export interface ActiveWorkItem {
  workerId: string
  workerName: string
  accent: string
  label: string
  detail: string
  progress: number
  done: number
  target: number
  etaSeconds: number
}

export function activeWork(workers: Worker[], executions: WorkerExecution[], tasks: WorkerTask[]): ActiveWorkItem[] {
  const running = executions.filter((e) => e.status === "running")
  return running.map((e) => {
    const worker = workers.find((w) => w.id === e.workerId)
    const task = tasks.find((t) => t.id === e.taskId)
    const template = task ? SKILL_CATALOG.find((s) => s.id === task.skillId) : undefined
    const remaining = Math.max(0, e.target - e.done)
    return {
      workerId: e.workerId,
      workerName: worker?.identity.name ?? "Worker",
      accent: worker?.identity.accent ?? "#5a6ef0",
      label: e.label,
      detail: template ? `${e.done} / ${e.target} ${template.unit}` : `${e.done} / ${e.target}`,
      progress: e.progress,
      done: e.done,
      target: e.target,
      etaSeconds: Math.max(1, Math.round(remaining * 0.42)),
    }
  })
}

/* ---- today's activity timeline ---- */
export interface TimelineEntry {
  id: string
  ts: number
  workerId: string
  workerName: string
  accent: string
  text: string
  executionId: string
  type: OutputKind
}

export function todaysTimeline(workers: Worker[], executions: WorkerExecution[], tasks: WorkerTask[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const e of executions) {
    if (e.status !== "completed" || !e.completedAt || !isToday(e.completedAt)) continue
    const worker = workers.find((w) => w.id === e.workerId)
    const task = tasks.find((t) => t.id === e.taskId)
    const template = task ? SKILL_CATALOG.find((s) => s.id === task.skillId) : undefined
    if (!worker || !template) continue
    entries.push({
      id: e.id,
      ts: e.completedAt,
      workerId: worker.id,
      workerName: worker.identity.name,
      accent: worker.identity.accent,
      text: `${worker.identity.name} ${template.verb} ${e.done} ${template.unit}`,
      executionId: e.id,
      type: template.produces,
    })
  }
  return entries.sort((a, b) => b.ts - a.ts)
}

/* ---- header metrics (Outputs Hub) ---- */
export interface HeaderMetrics {
  tasksCompleted: number
  outputsProduced: number
  successRate: number
  humanApprovals: number
  escalations: number
  failedTasks: number
}

export function headerMetrics(tasks: WorkerTask[], outputs: WorkerOutput[]): HeaderMetrics {
  const todaysTasks = tasks.filter((t) => isToday(t.createdAt))
  const todaysOutputs = outputs.filter((o) => isToday(o.createdAt))
  const failed = todaysOutputs.filter((o) => o.status === "failed").length
  const successRate = todaysOutputs.length ? Math.round(((todaysOutputs.length - failed) / todaysOutputs.length) * 1000) / 10 : 100
  return {
    tasksCompleted: todaysTasks.filter((t) => t.status === "completed").length,
    outputsProduced: todaysOutputs.length,
    successRate,
    humanApprovals: todaysOutputs.filter((o) => o.approval === "pending").length,
    escalations: todaysOutputs.filter((o) => o.policyChecks?.some((p) => /escalat|review/i.test(p))).length,
    failedTasks: todaysTasks.filter((t) => t.status === "failed").length,
  }
}

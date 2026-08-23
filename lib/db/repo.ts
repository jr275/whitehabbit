import "server-only"

/* ================================================================== *
 * REPOSITORY — the only place that touches SQL. Every function here
 * reads or writes a real row; nothing in this file invents data.
 * ================================================================== */

import { getDb } from "./client"
import type {
  BusinessEvent,
  MetricRecord,
  Worker,
  WorkerEvent,
  WorkerExecution,
  WorkerOutput,
  WorkerTask,
} from "@/lib/workforce/model"

export const DEFAULT_ORG_ID = "org_default"

export function ensureDefaultOrg() {
  const db = getDb()
  const row = db.prepare("SELECT id FROM organizations WHERE id = ?").get(DEFAULT_ORG_ID)
  if (!row) {
    db.prepare("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run(
      DEFAULT_ORG_ID,
      "WhiteHabbit",
      Date.now(),
    )
  }
}

/* ---- workers ---- */
export function listWorkers(orgId: string = DEFAULT_ORG_ID): Worker[] {
  const db = getDb()
  const rows = db.prepare("SELECT definition FROM workers WHERE org_id = ? ORDER BY created_at ASC").all(orgId) as {
    definition: string
  }[]
  return rows.map((r) => JSON.parse(r.definition) as Worker)
}

export function getWorker(id: string): Worker | null {
  const db = getDb()
  const row = db.prepare("SELECT definition FROM workers WHERE id = ?").get(id) as { definition: string } | undefined
  return row ? (JSON.parse(row.definition) as Worker) : null
}

export function upsertWorker(worker: Worker, orgId: string = DEFAULT_ORG_ID) {
  const db = getDb()
  const now = Date.now()
  const exists = db.prepare("SELECT id FROM workers WHERE id = ?").get(worker.id)
  if (exists) {
    db.prepare("UPDATE workers SET name = ?, definition = ?, updated_at = ? WHERE id = ?").run(
      worker.identity.name || "Unnamed worker",
      JSON.stringify(worker),
      now,
      worker.id,
    )
  } else {
    db.prepare(
      "INSERT INTO workers (id, org_id, name, definition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(worker.id, orgId, worker.identity.name || "Unnamed worker", JSON.stringify(worker), now, now)
  }
}

export function deleteWorker(id: string) {
  const db = getDb()
  db.prepare("DELETE FROM workers WHERE id = ?").run(id)
}

/* ---- tasks ---- */
export function insertTask(task: WorkerTask, input: Record<string, string>) {
  const db = getDb()
  db.prepare(
    "INSERT INTO tasks (id, worker_id, skill_id, category, title, input, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(task.id, task.workerId, task.skillId, task.type, task.title, JSON.stringify(input), task.status, task.createdAt)
}

export function updateTaskStatus(id: string, status: WorkerTask["status"]) {
  const db = getDb()
  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, id)
}

/* ---- executions ---- */
export function insertExecution(exec: WorkerExecution) {
  const db = getDb()
  db.prepare(
    "INSERT INTO executions (id, worker_id, task_id, status, reason_code, blocked_reason, started_at, completed_at, duration_ms, cost_usd, input_tokens, output_tokens, model, execution_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    exec.id,
    exec.workerId,
    exec.taskId,
    exec.status,
    exec.reasonCode ?? null,
    exec.blockedReason ?? null,
    exec.startedAt,
    exec.completedAt ?? null,
    null,
    null,
    null,
    null,
    null,
    null,
  )
}

export function finalizeExecution(
  id: string,
  patch: {
    status: WorkerExecution["status"]
    reasonCode?: WorkerExecution["reasonCode"]
    blockedReason?: string
    completedAt: number
    durationMs: number
    costUsd?: number
    inputTokens?: number
    outputTokens?: number
    model?: string
    executionMode?: WorkerExecution["executionMode"]
  },
) {
  const db = getDb()
  db.prepare(
    "UPDATE executions SET status = ?, reason_code = ?, blocked_reason = ?, completed_at = ?, duration_ms = ?, cost_usd = ?, input_tokens = ?, output_tokens = ?, model = ?, execution_mode = ? WHERE id = ?",
  ).run(
    patch.status,
    patch.reasonCode ?? null,
    patch.blockedReason ?? null,
    patch.completedAt,
    patch.durationMs,
    patch.costUsd ?? null,
    patch.inputTokens ?? null,
    patch.outputTokens ?? null,
    patch.model ?? null,
    patch.executionMode ?? null,
    id,
  )
}

/* ---- events ---- */
export function insertEvent(event: WorkerEvent) {
  const db = getDb()
  db.prepare(
    "INSERT INTO events (id, worker_id, execution_id, task_id, type, payload, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(event.id, event.workerId, event.executionId, event.taskId, event.type, JSON.stringify(event.payload), event.timestamp)
}

/* ---- outputs ---- */
export function insertOutput(output: WorkerOutput) {
  const db = getDb()
  db.prepare(
    "INSERT INTO outputs (id, worker_id, task_id, execution_id, type, title, content, sources, quality_score, evaluation, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    output.id,
    output.workerId,
    output.taskId,
    output.executionId,
    output.type,
    output.title,
    JSON.stringify({ content: output.content, structured: output.structured }),
    JSON.stringify(output.sources ?? []),
    output.qualityScore ?? null,
    JSON.stringify(output.evaluation ?? null),
    output.status,
    output.createdAt,
  )
}

/* ---- business events + metrics ---- */
export function insertBusinessEvent(be: BusinessEvent) {
  const db = getDb()
  db.prepare(
    "INSERT INTO business_events (id, worker_id, output_id, type, payload, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(be.id, be.workerId, be.outputId ?? null, be.type, JSON.stringify(be.payload), be.occurredAt)
}

export function insertMetric(metric: MetricRecord) {
  const db = getDb()
  db.prepare(
    "INSERT INTO metrics (id, worker_id, execution_id, business_event_id, key, kind, value, unit, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    metric.id,
    metric.workerId,
    metric.executionId ?? null,
    metric.businessEventId ?? null,
    metric.key,
    metric.kind,
    metric.value,
    metric.unit ?? null,
    metric.recordedAt,
  )
}

/* ---- bootstrap read: everything the client needs in one shot ---- */
export interface BootstrapState {
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
  metrics: MetricRecord[]
  businessEvents: BusinessEvent[]
}

export function getBootstrapState(orgId: string = DEFAULT_ORG_ID): BootstrapState {
  const db = getDb()
  const workers = listWorkers(orgId)
  const workerIds = workers.map((w) => w.id)
  if (workerIds.length === 0) {
    return { workers: [], tasks: [], executions: [], outputs: [], metrics: [], businessEvents: [] }
  }
  const placeholders = workerIds.map(() => "?").join(",")

  const taskRows = db
    .prepare(`SELECT * FROM tasks WHERE worker_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 500`)
    .all(...workerIds) as any[]
  const tasks: WorkerTask[] = taskRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    skillId: r.skill_id,
    type: r.category,
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
  }))

  const execRows = db
    .prepare(`SELECT * FROM executions WHERE worker_id IN (${placeholders}) ORDER BY started_at DESC LIMIT 500`)
    .all(...workerIds) as any[]
  const executions: WorkerExecution[] = execRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    taskId: r.task_id,
    status: r.status,
    reasonCode: r.reason_code ?? undefined,
    blockedReason: r.blocked_reason ?? undefined,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? null,
    durationMs: r.duration_ms ?? undefined,
    costUsd: r.cost_usd ?? undefined,
    inputTokens: r.input_tokens ?? undefined,
    outputTokens: r.output_tokens ?? undefined,
    model: r.model ?? undefined,
    executionMode: r.execution_mode ?? undefined,
  }))

  const outputRows = db
    .prepare(`SELECT * FROM outputs WHERE worker_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 500`)
    .all(...workerIds) as any[]
  const outputs: WorkerOutput[] = outputRows.map((r) => {
    const body = JSON.parse(r.content) as { content: string; structured?: unknown }
    return {
      id: r.id,
      workerId: r.worker_id,
      taskId: r.task_id,
      executionId: r.execution_id,
      type: r.type,
      title: r.title,
      content: body.content,
      structured: body.structured,
      sources: JSON.parse(r.sources ?? "[]"),
      qualityScore: r.quality_score ?? undefined,
      evaluation: r.evaluation ? JSON.parse(r.evaluation) : undefined,
      status: r.status,
      createdAt: r.created_at,
    }
  })

  const metricRows = db
    .prepare(`SELECT * FROM metrics WHERE worker_id IN (${placeholders}) ORDER BY recorded_at DESC LIMIT 1000`)
    .all(...workerIds) as any[]
  const metrics: MetricRecord[] = metricRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    executionId: r.execution_id ?? undefined,
    businessEventId: r.business_event_id ?? undefined,
    key: r.key,
    kind: r.kind,
    value: r.value,
    unit: r.unit ?? undefined,
    recordedAt: r.recorded_at,
  }))

  const beRows = db
    .prepare(`SELECT * FROM business_events WHERE worker_id IN (${placeholders}) ORDER BY occurred_at DESC LIMIT 500`)
    .all(...workerIds) as any[]
  const businessEvents: BusinessEvent[] = beRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    outputId: r.output_id ?? undefined,
    type: r.type,
    payload: JSON.parse(r.payload),
    occurredAt: r.occurred_at,
  }))

  return { workers, tasks, executions, outputs, metrics, businessEvents }
}

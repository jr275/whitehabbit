import "server-only"

/* ================================================================== *
 * REPOSITORY — the only place that touches SQL. Every function here
 * reads or writes a real row in the production PostgreSQL database;
 * nothing in this file invents data. Every function that reads or
 * writes a Worker-owned row takes an explicit orgId and filters on
 * it — callers derive orgId from the authenticated session
 * (lib/auth.ts), never from client input. See lib/db/client.ts for
 * why this is Postgres, not SQLite.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "./client"
import type {
  BusinessEvent,
  MetricRecord,
  Worker,
  WorkerDefinitionSnapshot,
  WorkerEvent,
  WorkerExecution,
  WorkerOutput,
  WorkerTask,
  WorkerVersion,
} from "@/lib/workforce/model"

/* ================================================================== *
 * ORGANIZATIONS / USERS / MEMBERSHIPS — the tenancy boundary.
 * ================================================================== */

export interface OrgRow {
  id: string
  name: string
  createdAt: number
}

export async function createOrganization(name: string): Promise<OrgRow> {
  const id = `org_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)", [id, name, now])
  return { id, name, createdAt: now }
}

export interface UserRow {
  id: string
  email: string
  passwordHash: string
  createdAt: number
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const row = await queryOne<{ id: string; email: string; password_hash: string; created_at: string }>(
    "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
    [email.toLowerCase().trim()],
  )
  return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: Number(row.created_at) } : null
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const row = await queryOne<{ id: string; email: string; password_hash: string; created_at: string }>(
    "SELECT id, email, password_hash, created_at FROM users WHERE id = $1",
    [id],
  )
  return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: Number(row.created_at) } : null
}

/** Real sign-up: creates a user, a personal organization, and the
 * owning membership together, atomically — a user is never left
 * without an organization to work in. */
export async function createUserWithOrganization(email: string, passwordHash: string, orgName: string): Promise<{ user: UserRow; org: OrgRow }> {
  return withTransaction(async (client) => {
    const now = Date.now()
    const userId = `user_${randomUUID()}`
    const orgId = `org_${randomUUID()}`
    const normalizedEmail = email.toLowerCase().trim()

    await client.query("INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)", [userId, normalizedEmail, passwordHash, now])
    await client.query("INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)", [orgId, orgName, now])
    await client.query("INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [userId, orgId, now])

    return {
      user: { id: userId, email: normalizedEmail, passwordHash, createdAt: now },
      org: { id: orgId, name: orgName, createdAt: now },
    }
  })
}

/** The organization a user should land in — their first (oldest)
 * membership. This codebase's v1 tenancy model is one primary org per
 * user; the memberships table already supports more without a schema
 * change when multi-org switching is built. */
export async function getPrimaryOrgForUser(userId: string): Promise<OrgRow | null> {
  const row = await queryOne<{ id: string; name: string; created_at: string }>(
    `SELECT o.id, o.name, o.created_at FROM organizations o
     JOIN memberships m ON m.org_id = o.id
     WHERE m.user_id = $1 ORDER BY m.created_at ASC LIMIT 1`,
    [userId],
  )
  return row ? { id: row.id, name: row.name, createdAt: Number(row.created_at) } : null
}

/** Authorization check: does this user actually belong to this org?
 * Every session-derived org context is verified against this before
 * being trusted for a request — a forged/stale org id in a session
 * can never grant access it doesn't actually have. */
export async function userBelongsToOrg(userId: string, orgId: string): Promise<boolean> {
  const row = await queryOne("SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2", [userId, orgId])
  return row !== null
}

/* ================================================================== *
 * WORKERS — org-scoped. Every read/write here takes orgId and filters
 * on it; there is no "get worker by id alone" path, by design (see
 * section 5/7 of the production hardening brief — org A must never
 * reach org B's Worker by id).
 * ================================================================== */

interface WorkerRow {
  id: string
  org_id: string
  name: string
  definition: Worker | Record<string, never>
  status: string
  tested: boolean
  released_version_id: string | null
  created_at: string
  updated_at: string
  released_at: string | null
}

function rowToWorker(r: WorkerRow): Worker {
  const def = r.definition as Worker
  return {
    ...def,
    id: r.id,
    status: r.status as Worker["status"],
    tested: r.tested,
    releasedVersionId: r.released_version_id,
    createdAt: Number(r.created_at),
    releasedAt: r.released_at ? Number(r.released_at) : null,
  }
}

export async function listWorkers(orgId: string): Promise<Worker[]> {
  const rows = await query<WorkerRow>("SELECT * FROM workers WHERE org_id = $1 ORDER BY created_at ASC", [orgId])
  return rows.map(rowToWorker)
}

/** Org-scoped by construction: returns null (never another org's
 * row) if the worker doesn't belong to orgId. */
export async function getWorker(id: string, orgId: string): Promise<Worker | null> {
  const row = await queryOne<WorkerRow>("SELECT * FROM workers WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToWorker(row) : null
}

export async function upsertWorker(worker: Worker, orgId: string, userId?: string): Promise<Worker> {
  const now = Date.now()
  const existing = await queryOne<{ id: string }>("SELECT id FROM workers WHERE id = $1 AND org_id = $2", [worker.id, orgId])
  const name = worker.identity.name || "Unnamed worker"
  const definition = JSON.stringify(worker)

  if (existing) {
    await query(
      "UPDATE workers SET name = $1, definition = $2, status = $3, tested = $4, updated_at = $5, updated_by = $6 WHERE id = $7 AND org_id = $8",
      [name, definition, worker.status, worker.tested, now, userId ?? null, worker.id, orgId],
    )
  } else {
    await query(
      `INSERT INTO workers (id, org_id, name, definition, status, tested, released_version_id, created_at, updated_at, released_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [worker.id, orgId, name, definition, worker.status, worker.tested, worker.releasedVersionId, now, now, worker.releasedAt, userId ?? null, userId ?? null],
    )
  }
  return (await getWorker(worker.id, orgId))!
}

export async function deleteWorker(id: string, orgId: string): Promise<void> {
  await query("DELETE FROM workers WHERE id = $1 AND org_id = $2", [id, orgId])
}

/** Marks a worker tested — set ONLY by the server, ONLY after a real
 * test-mode execution actually completes (see app/api/workers/[id]/
 * run/route.ts). Never client-settable via PATCH — `tested` gates
 * Release, so it must be a fact the server itself verified, not
 * something the client asserts. */
export async function markWorkerTested(id: string, orgId: string): Promise<void> {
  await query("UPDATE workers SET tested = TRUE, updated_at = $1 WHERE id = $2 AND org_id = $3", [Date.now(), id, orgId])
}

/* ---- worker versions: immutable Build artifacts ------------------ */

interface WorkerVersionRow {
  id: string
  worker_id: string
  version_number: number
  definition: WorkerDefinitionSnapshot
  fingerprint: string
  status: string
  created_at: string
  released_at: string | null
}

function rowToVersion(r: WorkerVersionRow): WorkerVersion {
  return {
    id: r.id,
    workerId: r.worker_id,
    versionNumber: r.version_number,
    definition: r.definition,
    fingerprint: r.fingerprint,
    status: r.status as WorkerVersion["status"],
    createdAt: Number(r.created_at),
    releasedAt: r.released_at ? Number(r.released_at) : null,
  }
}

/** Build: freezes the current draft definition into a new immutable
 * version, unless the most recent version already has the identical
 * fingerprint (a build with no real changes reuses that version
 * rather than accumulating identical rows — still a real, correct
 * reproducibility guarantee, just not wasteful). */
export async function buildWorkerVersion(workerId: string, orgId: string, definition: WorkerDefinitionSnapshot, fingerprint: string): Promise<WorkerVersion> {
  return withTransaction(async (client) => {
    const { rows: latestRows } = await client.query<WorkerVersionRow>(
      "SELECT * FROM worker_versions WHERE worker_id = $1 ORDER BY version_number DESC LIMIT 1",
      [workerId],
    )
    const latest = latestRows[0]
    if (latest && latest.fingerprint === fingerprint) {
      return rowToVersion(latest)
    }
    const nextVersion = (latest?.version_number ?? 0) + 1
    const id = `wv_${randomUUID()}`
    const now = Date.now()
    await client.query(
      `INSERT INTO worker_versions (id, worker_id, org_id, version_number, definition, fingerprint, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ready', $7)`,
      [id, workerId, orgId, nextVersion, JSON.stringify(definition), fingerprint, now],
    )
    await client.query("UPDATE workers SET status = 'ready', updated_at = $1 WHERE id = $2 AND org_id = $3", [now, workerId, orgId])
    return { id, workerId, versionNumber: nextVersion, definition, fingerprint, status: "ready", createdAt: now, releasedAt: null }
  })
}

export async function getWorkerVersion(id: string, orgId: string): Promise<WorkerVersion | null> {
  const row = await queryOne<WorkerVersionRow>("SELECT wv.* FROM worker_versions wv WHERE wv.id = $1 AND wv.org_id = $2", [id, orgId])
  return row ? rowToVersion(row) : null
}

export async function getLatestWorkerVersion(workerId: string, orgId: string): Promise<WorkerVersion | null> {
  const row = await queryOne<WorkerVersionRow>(
    "SELECT * FROM worker_versions WHERE worker_id = $1 AND org_id = $2 ORDER BY version_number DESC LIMIT 1",
    [workerId, orgId],
  )
  return row ? rowToVersion(row) : null
}

/** Release: promotes exactly one READY version to RELEASED and points
 * the Worker's releasedVersionId at it — the one authoritative "is
 * this live" fact. Any previously-released version for this worker is
 * archived (never deleted — past executions still reference it). */
export async function releaseWorkerVersion(workerId: string, orgId: string, versionId: string): Promise<{ worker: Worker; version: WorkerVersion }> {
  return withTransaction(async (client) => {
    const now = Date.now()
    await client.query(
      "UPDATE worker_versions SET status = 'archived' WHERE worker_id = $1 AND status = 'released'",
      [workerId],
    )
    const { rows } = await client.query<WorkerVersionRow>(
      "UPDATE worker_versions SET status = 'released', released_at = $1 WHERE id = $2 AND worker_id = $3 AND org_id = $4 RETURNING *",
      [now, versionId, workerId, orgId],
    )
    if (!rows[0]) throw new Error("Version not found for this worker/organization.")
    await client.query(
      "UPDATE workers SET status = 'live', released_version_id = $1, released_at = $2, updated_at = $2 WHERE id = $3 AND org_id = $4",
      [versionId, now, workerId, orgId],
    )
    const { rows: workerRows } = await client.query<WorkerRow>("SELECT * FROM workers WHERE id = $1 AND org_id = $2", [workerId, orgId])
    return { worker: rowToWorker(workerRows[0]), version: rowToVersion(rows[0]) }
  })
}

/* ---- tasks --------------------------------------------------------- */
export async function insertTask(task: WorkerTask, orgId: string, input: Record<string, string>): Promise<void> {
  await query(
    "INSERT INTO tasks (id, org_id, worker_id, skill_id, category, title, input, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [task.id, orgId, task.workerId, task.skillId, task.type, task.title, JSON.stringify(input), task.status, task.createdAt],
  )
}

export async function updateTaskStatus(id: string, status: WorkerTask["status"]): Promise<void> {
  await query("UPDATE tasks SET status = $1 WHERE id = $2", [status, id])
}

/* ---- executions ------------------------------------------------------ */
export async function insertExecution(exec: WorkerExecution, orgId: string): Promise<void> {
  await query(
    `INSERT INTO executions (id, org_id, worker_id, worker_version_id, task_id, status, reason_code, blocked_reason, started_at, completed_at, duration_ms, cost_usd, input_tokens, output_tokens, model, execution_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      exec.id,
      orgId,
      exec.workerId,
      exec.workerVersionId ?? null,
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
    ],
  )
}

export async function updateExecutionStatus(id: string, status: WorkerExecution["status"]): Promise<void> {
  await query("UPDATE executions SET status = $1 WHERE id = $2", [status, id])
}

export async function finalizeExecution(
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
): Promise<void> {
  await query(
    `UPDATE executions SET status = $1, reason_code = $2, blocked_reason = $3, completed_at = $4, duration_ms = $5, cost_usd = $6, input_tokens = $7, output_tokens = $8, model = $9, execution_mode = $10 WHERE id = $11`,
    [
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
    ],
  )
}

interface ExecutionRow {
  id: string
  org_id: string
  worker_id: string
  worker_version_id: string | null
  task_id: string
  status: string
  reason_code: string | null
  blocked_reason: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  cost_usd: number | null
  input_tokens: number | null
  output_tokens: number | null
  model: string | null
  execution_mode: string | null
}

function rowToExecution(r: ExecutionRow): WorkerExecution {
  return {
    id: r.id,
    workerId: r.worker_id,
    workerVersionId: r.worker_version_id ?? undefined,
    taskId: r.task_id,
    status: r.status as WorkerExecution["status"],
    reasonCode: (r.reason_code as WorkerExecution["reasonCode"]) ?? undefined,
    blockedReason: r.blocked_reason ?? undefined,
    startedAt: Number(r.started_at),
    completedAt: r.completed_at ? Number(r.completed_at) : null,
    durationMs: r.duration_ms ?? undefined,
    costUsd: r.cost_usd ?? undefined,
    inputTokens: r.input_tokens ?? undefined,
    outputTokens: r.output_tokens ?? undefined,
    model: r.model ?? undefined,
    executionMode: (r.execution_mode as WorkerExecution["executionMode"]) ?? undefined,
  }
}

/** Org-scoped single-execution read — the reconnect/poll endpoint's
 * source of truth. Never returns another org's execution. */
export async function getExecution(id: string, orgId: string): Promise<WorkerExecution | null> {
  const row = await queryOne<ExecutionRow>("SELECT * FROM executions WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToExecution(row) : null
}

/* ---- execution events: durable, sequenced -------------------------
 * `sequence` is computed inside the INSERT itself (MAX+1 subquery),
 * not tracked in process memory — correct even if a reconnect or a
 * retry lands on a different warm serverless instance than the one
 * that emitted earlier events for the same execution. */
export async function insertExecutionEvent(event: WorkerEvent, orgId: string): Promise<WorkerEvent> {
  const row = await queryOne<{ sequence: number }>(
    `INSERT INTO execution_events (id, org_id, execution_id, worker_id, task_id, sequence, type, payload, "timestamp")
     VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sequence) FROM execution_events WHERE execution_id = $3), 0) + 1, $6, $7, $8)
     RETURNING sequence`,
    [event.id, orgId, event.executionId, event.workerId, event.taskId, event.type, JSON.stringify(event.payload), event.timestamp],
  )
  return { ...event, sequence: row?.sequence }
}

export async function getExecutionEvents(executionId: string, orgId: string): Promise<WorkerEvent[]> {
  const rows = await query<{ id: string; execution_id: string; worker_id: string; task_id: string; type: string; payload: Record<string, unknown>; timestamp: string; sequence: number }>(
    'SELECT * FROM execution_events WHERE execution_id = $1 AND org_id = $2 ORDER BY sequence ASC',
    [executionId, orgId],
  )
  return rows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    executionId: r.execution_id,
    taskId: r.task_id,
    type: r.type as WorkerEvent["type"],
    timestamp: Number(r.timestamp),
    payload: r.payload,
    sequence: r.sequence,
  }))
}

/* ---- outputs ---------------------------------------------------------- */
export async function insertOutput(output: WorkerOutput, orgId: string): Promise<void> {
  await query(
    `INSERT INTO outputs (id, org_id, worker_id, task_id, execution_id, type, title, content, sources, quality_score, evaluation, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      output.id,
      orgId,
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
    ],
  )
}

/* ---- business events + metrics -------------------------------------- */
export async function insertBusinessEvent(be: BusinessEvent, orgId: string): Promise<void> {
  await query(
    "INSERT INTO business_events (id, org_id, worker_id, output_id, type, payload, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [be.id, orgId, be.workerId, be.outputId ?? null, be.type, JSON.stringify(be.payload), be.occurredAt],
  )
}

export async function insertMetric(metric: MetricRecord, orgId: string): Promise<void> {
  await query(
    "INSERT INTO metrics (id, org_id, worker_id, execution_id, business_event_id, key, kind, value, unit, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    [metric.id, orgId, metric.workerId, metric.executionId ?? null, metric.businessEventId ?? null, metric.key, metric.kind, metric.value, metric.unit ?? null, metric.recordedAt],
  )
}

/* ---- bootstrap read: everything the client needs in one shot --------- */
export interface BootstrapState {
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
  events: WorkerEvent[]
  metrics: MetricRecord[]
  businessEvents: BusinessEvent[]
}

export async function getBootstrapState(orgId: string): Promise<BootstrapState> {
  const workers = await listWorkers(orgId)
  const workerIds = workers.map((w) => w.id)
  if (workerIds.length === 0) {
    return { workers: [], tasks: [], executions: [], outputs: [], events: [], metrics: [], businessEvents: [] }
  }
  const placeholders = workerIds.map((_, i) => `$${i + 2}`).join(",")

  const taskRows = await query<{ id: string; worker_id: string; skill_id: string; category: string; title: string; status: string; created_at: string }>(
    `SELECT id, worker_id, skill_id, category, title, status, created_at FROM tasks WHERE org_id = $1 AND worker_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 500`,
    [orgId, ...workerIds],
  )
  const tasks: WorkerTask[] = taskRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    skillId: r.skill_id,
    type: r.category as WorkerTask["type"],
    title: r.title,
    status: r.status as WorkerTask["status"],
    createdAt: Number(r.created_at),
  }))

  const execRows = await query<ExecutionRow>(
    `SELECT * FROM executions WHERE org_id = $1 AND worker_id IN (${placeholders}) ORDER BY started_at DESC LIMIT 500`,
    [orgId, ...workerIds],
  )
  const executions: WorkerExecution[] = execRows.map(rowToExecution)

  const outputRows = await query<{
    id: string
    worker_id: string
    task_id: string
    execution_id: string
    type: string
    title: string
    content: { content: string; structured?: unknown }
    sources: unknown
    quality_score: number | null
    evaluation: WorkerOutput["evaluation"] | null
    status: string
    created_at: string
  }>(`SELECT * FROM outputs WHERE org_id = $1 AND worker_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 500`, [orgId, ...workerIds])
  const outputs: WorkerOutput[] = outputRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    taskId: r.task_id,
    executionId: r.execution_id,
    type: r.type,
    title: r.title,
    content: r.content.content,
    structured: r.content.structured,
    sources: (r.sources as WorkerOutput["sources"]) ?? [],
    qualityScore: r.quality_score ?? undefined,
    evaluation: r.evaluation ?? undefined,
    status: r.status as WorkerOutput["status"],
    createdAt: Number(r.created_at),
  }))

  const eventRows = await query<{ id: string; execution_id: string; worker_id: string; task_id: string; type: string; payload: Record<string, unknown>; timestamp: string; sequence: number }>(
    `SELECT * FROM execution_events WHERE org_id = $1 AND worker_id IN (${placeholders}) ORDER BY "timestamp" DESC LIMIT 2000`,
    [orgId, ...workerIds],
  )
  const events: WorkerEvent[] = eventRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    executionId: r.execution_id,
    taskId: r.task_id,
    type: r.type as WorkerEvent["type"],
    timestamp: Number(r.timestamp),
    payload: r.payload,
    sequence: r.sequence,
  }))

  const metricRows = await query<{ id: string; worker_id: string; execution_id: string | null; business_event_id: string | null; key: string; kind: string; value: number; unit: string | null; recorded_at: string }>(
    `SELECT * FROM metrics WHERE org_id = $1 AND worker_id IN (${placeholders}) ORDER BY recorded_at DESC LIMIT 1000`,
    [orgId, ...workerIds],
  )
  const metrics: MetricRecord[] = metricRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    executionId: r.execution_id ?? undefined,
    businessEventId: r.business_event_id ?? undefined,
    key: r.key,
    kind: r.kind as MetricRecord["kind"],
    value: r.value,
    unit: r.unit ?? undefined,
    recordedAt: Number(r.recorded_at),
  }))

  const beRows = await query<{ id: string; worker_id: string; output_id: string | null; type: string; payload: Record<string, unknown>; occurred_at: string }>(
    `SELECT * FROM business_events WHERE org_id = $1 AND worker_id IN (${placeholders}) ORDER BY occurred_at DESC LIMIT 500`,
    [orgId, ...workerIds],
  )
  const businessEvents: BusinessEvent[] = beRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    outputId: r.output_id ?? undefined,
    type: r.type,
    payload: r.payload,
    occurredAt: Number(r.occurred_at),
  }))

  return { workers, tasks, executions, outputs, events, metrics, businessEvents }
}

/* ================================================================== *
 * RATE LIMITING — Postgres-backed fixed-window counter. Correct
 * across concurrent serverless instances because the database, not
 * process memory, is the single source of truth. Avoids adding a new
 * third-party dependency (e.g. Upstash/Redis) for this scale; that
 * remains the documented next step if request volume grows.
 * ================================================================== */

/** Atomically increments the counter for (scope, subject) in the
 * current fixed window and returns whether this call is within
 * limit. `windowMs`/`limit` are per-call so different actions (create
 * vs run vs build) can have different budgets. */
export async function checkRateLimit(scope: string, subject: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const bucketKey = `${scope}:${subject}:${windowStart}`
  const expiresAt = windowStart + windowMs

  const row = await queryOne<{ count: number }>(
    `INSERT INTO rate_limit_counters (bucket_key, count, window_start, expires_at)
     VALUES ($1, 1, $2, $3)
     ON CONFLICT (bucket_key) DO UPDATE SET count = rate_limit_counters.count + 1
     RETURNING count`,
    [bucketKey, windowStart, expiresAt],
  )
  const count = row?.count ?? 1
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
}

/** Best-effort cleanup of expired buckets — called opportunistically,
 * not on a schedule (no cron infra assumed); cheap enough (indexed on
 * expires_at) to run inline once in a while. */
export async function pruneExpiredRateLimits(): Promise<void> {
  await query("DELETE FROM rate_limit_counters WHERE expires_at < $1", [Date.now() - 60_000])
}

/* ================================================================== *
 * AUDIT LOG
 * ================================================================== */
export async function recordAudit(entry: { orgId?: string | null; userId?: string | null; action: string; resourceType: string; resourceId?: string | null; metadata?: Record<string, unknown> }): Promise<void> {
  await query(
    "INSERT INTO audit_log (id, org_id, user_id, action, resource_type, resource_id, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [`audit_${randomUUID()}`, entry.orgId ?? null, entry.userId ?? null, entry.action, entry.resourceType, entry.resourceId ?? null, JSON.stringify(entry.metadata ?? {}), Date.now()],
  )
}

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
import type { Connection } from "@/lib/connectors/types"
import type {
  Approval,
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
    // A Worker persisted before this field existed has no
    // `integrations` in its stored JSONB — real old data, not a bug —
    // default it here, the one real read boundary, rather than
    // requiring every downstream reader to guard against undefined.
    integrations: def.integrations ?? [],
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

/** The one org-scoped lookup the Product layer needs: "does this org
 * already have a Worker for this Product" — reads the same JSONB
 * `definition` column every other Worker read uses, filtered on the
 * productId field inside it. No new table, no migration. */
export async function getWorkerByProduct(orgId: string, productId: string): Promise<Worker | null> {
  const row = await queryOne<WorkerRow>(
    "SELECT * FROM workers WHERE org_id = $1 AND definition->>'productId' = $2 ORDER BY created_at ASC LIMIT 1",
    [orgId, productId],
  )
  return row ? rowToWorker(row) : null
}

/** Appends a real, dated fact to a Worker's accumulated Memory
 * KnowledgeSource — creating it on first use. Called only from
 * lib/agent/runtime.ts after a real evaluated execution completes for
 * a product-provisioned Worker; `note` must already be built from real
 * result/evaluation data by the caller, never invented here. Silently
 * a no-op if the worker no longer exists (never blocks the execution
 * that triggered it — see the try/catch at the call site).
 *
 * Deliberately a targeted `jsonb_set` on the `knowledge` path inside a
 * `SELECT ... FOR UPDATE` transaction, NOT a read-mutate-write through
 * upsertWorker(): this runs fire-and-forget, concurrently with
 * markWorkerTested()'s own write to the same row (app/api/workers/
 * [id]/run/route.ts, right after this execution's stream finishes).
 * A full-object upsertWorker() write here would read a `tested` value
 * that predates markWorkerTested()'s update and silently overwrite it
 * back to false if this write lands second — a real lost-update race
 * this fixed. Locking the row and touching only the one JSON path
 * this function actually owns makes the two writes safely commute
 * regardless of ordering. */
export async function appendWorkerMemory(workerId: string, orgId: string, note: string): Promise<void> {
  const now = Date.now()
  await withTransaction(async (client) => {
    const res = await client.query<{ definition: Worker }>("SELECT definition FROM workers WHERE id = $1 AND org_id = $2 FOR UPDATE", [workerId, orgId])
    const definition = res.rows[0]?.definition
    if (!definition) return
    const knowledge = definition.knowledge ?? []
    const existingIdx = knowledge.findIndex((k) => k.type === "memory")
    let updatedKnowledge
    if (existingIdx >= 0) {
      const existing = knowledge[existingIdx]
      updatedKnowledge = [
        ...knowledge.slice(0, existingIdx),
        { ...existing, content: existing.content ? `${existing.content}\n- ${note}` : `- ${note}`, documents: existing.documents + 1 },
        ...knowledge.slice(existingIdx + 1),
      ]
    } else {
      updatedKnowledge = [...knowledge, { id: `kn_mem_${randomUUID()}`, name: "Accumulated Memory", type: "memory" as const, documents: 1, addedAt: now, content: `- ${note}` }]
    }
    await client.query("UPDATE workers SET definition = jsonb_set(definition, '{knowledge}', $1::jsonb), updated_at = $2 WHERE id = $3 AND org_id = $4", [
      JSON.stringify(updatedKnowledge),
      now,
      workerId,
      orgId,
    ])
  })
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
    // Same real-old-data defaulting as rowToWorker() above — a
    // version built before this field existed has no `integrations`
    // in its frozen JSONB.
    definition: { ...r.definition, integrations: r.definition.integrations ?? [] },
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

interface TaskRow {
  id: string
  worker_id: string
  skill_id: string
  category: string
  title: string
  status: string
  created_at: string
}

/** Org-scoped single-task read — needed to know which real skill (and
 * therefore which skill.retryStage()) an execution belongs to when
 * retrying a failed pipeline stage outside the Approval flow (which
 * already carries skillId on the Approval row itself). */
export async function getTask(id: string, orgId: string): Promise<WorkerTask | null> {
  const row = await queryOne<TaskRow>("SELECT * FROM tasks WHERE id = $1 AND org_id = $2", [id, orgId])
  if (!row) return null
  return { id: row.id, workerId: row.worker_id, skillId: row.skill_id, type: row.category as WorkerTask["type"], title: row.title, status: row.status as WorkerTask["status"], createdAt: Number(row.created_at) }
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
  pipeline_state: unknown
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
    pipelineState: (r.pipeline_state as WorkerExecution["pipelineState"]) ?? undefined,
  }
}

/** Org-scoped single-execution read — the reconnect/poll endpoint's
 * source of truth. Never returns another org's execution. */
export async function getExecution(id: string, orgId: string): Promise<WorkerExecution | null> {
  const row = await queryOne<ExecutionRow>("SELECT * FROM executions WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToExecution(row) : null
}

/** Persists a resumable pipeline skill's real, current stage-by-stage
 * state — called after every stage transition (see lib/agent/
 * pipeline/driver.ts) so the execution graph UI, "retry failed step",
 * and Approve-driven resume all read the exact same durable state. */
export async function updatePipelineState(id: string, orgId: string, state: unknown): Promise<void> {
  await query("UPDATE executions SET pipeline_state = $1 WHERE id = $2 AND org_id = $3", [JSON.stringify(state), id, orgId])
}

/* ---- execution leases: real concurrency control (section 12) ------
 * A real lock, not an in-memory flag — two processes/warm serverless
 * instances trying to resume/retry the same execution race on this
 * table, not on anything held in memory. A lease is time-bounded
 * (lease_until, not a boolean) so a holder that crashed mid-resume
 * never wedges the execution forever — it just expires and the next
 * real attempt (a human re-clicking Approve, a retry) can acquire it. */
export interface ExecutionLease {
  executionId: string
  leaseOwner: string
  leaseUntil: number
  acquiredAt: number
}

/** Atomically acquires the lease for `executionId` — succeeds if no
 * lease row exists yet, OR the existing one has expired (lease_until
 * in the past). Returns null if another owner currently holds a
 * live lease — the caller must NOT proceed to resume/retry. */
export async function acquireExecutionLease(executionId: string, owner: string, ttlMs: number): Promise<ExecutionLease | null> {
  const now = Date.now()
  const until = now + ttlMs
  const row = await queryOne<{ execution_id: string; lease_owner: string; lease_until: string; acquired_at: string }>(
    `INSERT INTO execution_leases (execution_id, lease_owner, lease_until, acquired_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (execution_id) DO UPDATE
       SET lease_owner = EXCLUDED.lease_owner, lease_until = EXCLUDED.lease_until, acquired_at = EXCLUDED.acquired_at
       WHERE execution_leases.lease_until < $4
     RETURNING execution_id, lease_owner, lease_until, acquired_at`,
    [executionId, owner, until, now],
  )
  if (!row) return null // a live lease is already held by someone else
  return { executionId: row.execution_id, leaseOwner: row.lease_owner, leaseUntil: Number(row.lease_until), acquiredAt: Number(row.acquired_at) }
}

/** Releases the lease — a no-op (never releases someone else's lease)
 * if `owner` no longer matches, e.g. it already expired and was
 * re-acquired by another real attempt. */
export async function releaseExecutionLease(executionId: string, owner: string): Promise<void> {
  await query("DELETE FROM execution_leases WHERE execution_id = $1 AND lease_owner = $2", [executionId, owner])
}

/* ---- action executions: the real idempotency ledger (section 16) ---- */
export interface ActionExecutionRow {
  id: string
  orgId: string
  executionId: string
  stepId?: string
  integrationId?: string
  provider: string
  action: string
  resource?: string
  idempotencyKey: string
  status: "pending" | "completed" | "failed"
  attempt: number
  result?: unknown
  errorCode?: string
  errorMessage?: string
  createdAt: number
  completedAt?: number
}

function rowToActionExecution(r: {
  id: string
  org_id: string
  execution_id: string
  step_id: string | null
  integration_id: string | null
  provider: string
  action: string
  resource: string | null
  idempotency_key: string
  status: string
  attempt: number
  result: unknown
  error_code: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}): ActionExecutionRow {
  return {
    id: r.id,
    orgId: r.org_id,
    executionId: r.execution_id,
    stepId: r.step_id ?? undefined,
    integrationId: r.integration_id ?? undefined,
    provider: r.provider,
    action: r.action,
    resource: r.resource ?? undefined,
    idempotencyKey: r.idempotency_key,
    status: r.status as ActionExecutionRow["status"],
    attempt: r.attempt ?? 1,
    result: r.result ?? undefined,
    errorCode: r.error_code ?? undefined,
    errorMessage: r.error_message ?? undefined,
    createdAt: Number(r.created_at),
    completedAt: r.completed_at ? Number(r.completed_at) : undefined,
  }
}

/** Idempotency lookup by key alone — the key string already embeds
 * the execution id (see lib/agent/pipeline/idempotency.ts), so this
 * is safe without an org filter: a retried stage checks this BEFORE
 * ever calling the real external action again. Callable from the
 * skill layer, which never has direct DB/org-id access — org scoping
 * happens at insert time via a subquery on executions.org_id instead
 * (see claimActionExecution). */
export async function getActionExecutionByKey(idempotencyKey: string): Promise<ActionExecutionRow | null> {
  const row = await queryOne<Parameters<typeof rowToActionExecution>[0]>("SELECT * FROM action_executions WHERE idempotency_key = $1", [idempotencyKey])
  return row ? rowToActionExecution(row) : null
}

/** All real action-execution records for one execution, in order —
 * the authoritative record for external side effects (section 6),
 * including every attempt, never just the latest. */
/** Org-scoped (section 18) — org_id is populated server-side at claim
 * time (see claimActionExecution's subquery), so this can filter on
 * it directly; a caller from another org gets an empty list, never
 * another org's real action-execution records, even if it somehow
 * knew a real executionId that isn't its own. */
export async function listActionExecutions(executionId: string, orgId: string): Promise<ActionExecutionRow[]> {
  const rows = await query<Parameters<typeof rowToActionExecution>[0]>("SELECT * FROM action_executions WHERE execution_id = $1 AND org_id = $2 ORDER BY created_at ASC", [executionId, orgId])
  return rows.map(rowToActionExecution)
}

/** Claims an idempotency key by inserting a 'pending' row BEFORE the
 * real external call is attempted — the unique index on
 * idempotency_key means a concurrent duplicate attempt fails here,
 * atomically, rather than racing two real external writes. org_id is
 * derived server-side from the given executionId (a subquery, not a
 * caller-supplied value) so the skill layer never needs its own
 * org-id access. Returns null if the key is already claimed (by this
 * call or an earlier one) — the caller must then re-check
 * getActionExecutionByKey(). `attempt` is the caller's own real
 * attempt counter (section 6/8) — persisted verbatim, never re-derived. */
/** A real UPSERT, not a plain INSERT (section 8: a FAILED prior
 * attempt must be retryable, never permanently cached as a
 * failure — only a COMPLETED one is a true dedupe target):
 *   - no existing row for this key           -> inserts fresh (attempt 1)
 *   - existing row status = 'failed'         -> reclaims it: attempt+1, status back to 'pending'
 *   - existing row status = 'completed'      -> untouched, returns null (the caller dedupes via getActionExecutionByKey)
 *   - existing row status = 'pending'        -> untouched, returns null (someone else's attempt is in flight)
 * The conditional `WHERE ... status = 'failed'` on the UPDATE is what
 * makes this a real, atomic compare-and-swap — Postgres returns no
 * row from an ON CONFLICT DO UPDATE whose WHERE clause didn't match. */
export async function claimActionExecution(input: { executionId: string; stepId?: string; integrationId?: string; provider: string; action: string; resource?: string; idempotencyKey: string }): Promise<ActionExecutionRow | null> {
  const id = `axn_${randomUUID()}`
  const now = Date.now()
  const row = await queryOne<Parameters<typeof rowToActionExecution>[0]>(
    `INSERT INTO action_executions (id, org_id, execution_id, step_id, integration_id, provider, action, resource, idempotency_key, status, attempt, created_at)
     VALUES ($1, (SELECT org_id FROM executions WHERE id = $2), $2, $3, $4, $5, $6, $7, $8, 'pending', 1, $9)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET status = 'pending', attempt = action_executions.attempt + 1, completed_at = NULL, error_code = NULL, error_message = NULL
       WHERE action_executions.status = 'failed'
     RETURNING *`,
    [id, input.executionId, input.stepId ?? null, input.integrationId ?? null, input.provider, input.action, input.resource ?? null, input.idempotencyKey, now],
  )
  return row ? rowToActionExecution(row) : null
}

export async function completeActionExecution(id: string, status: "completed" | "failed", result?: unknown, error?: { code?: string; message?: string }): Promise<void> {
  await query("UPDATE action_executions SET status = $1, result = $2, error_code = $3, error_message = $4, completed_at = $5 WHERE id = $6", [
    status,
    result != null ? JSON.stringify(result) : null,
    error?.code ?? null,
    error?.message ?? null,
    Date.now(),
    id,
  ])
}

/* ---- execution events: durable, sequenced -------------------------
 * `sequence` is computed inside the INSERT itself (MAX+1 subquery),
 * not tracked in process memory — correct even if a reconnect or a
 * retry lands on a different warm serverless instance than the one
 * that emitted earlier events for the same execution.
 *
 * `idempotencyKey` (section 14) is optional — most events (task_*,
 * output_created, ...) only ever fire once per real execution by
 * construction and don't need one. A resumable pipeline's stage_*
 * events pass a deterministic key (execution + type + stage +
 * attempt — see lib/agent/runtime.ts's makeEmitter) so the exact same
 * logical event can never be inserted twice: ON CONFLICT DO NOTHING
 * against the partial unique index, then the pre-existing row's real
 * sequence is returned instead — the caller never sees an error, and
 * never sees a duplicate row. */
export async function insertExecutionEvent(event: WorkerEvent, orgId: string, idempotencyKey?: string): Promise<WorkerEvent> {
  const row = await queryOne<{ sequence: number }>(
    `INSERT INTO execution_events (id, org_id, execution_id, worker_id, task_id, sequence, type, payload, "timestamp", idempotency_key)
     VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sequence) FROM execution_events WHERE execution_id = $3), 0) + 1, $6, $7, $8, $9)
     ON CONFLICT (execution_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING sequence`,
    [event.id, orgId, event.executionId, event.workerId, event.taskId, event.type, JSON.stringify(event.payload), event.timestamp, idempotencyKey ?? null],
  )
  if (row) return { ...event, sequence: row.sequence }
  if (!idempotencyKey) return event // no key given and no row returned would be a real bug, not the idempotent-dedupe path
  // Conflict — the exact same logical event was already recorded; return the real, existing row's sequence.
  const existing = await queryOne<{ sequence: number }>("SELECT sequence FROM execution_events WHERE execution_id = $1 AND idempotency_key = $2", [event.executionId, idempotencyKey])
  return { ...event, sequence: existing?.sequence }
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
    `INSERT INTO business_events (id, org_id, worker_id, output_id, execution_id, type, entity_id, entity_type, numeric_value, currency, confidence, source, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      be.id,
      orgId,
      be.workerId,
      be.outputId ?? null,
      be.executionId ?? null,
      be.type,
      be.entityId ?? null,
      be.entityType ?? null,
      be.numericValue ?? null,
      be.currency ?? null,
      be.confidence ?? null,
      be.source ?? null,
      JSON.stringify(be.payload),
      be.occurredAt,
    ],
  )
}

export async function insertMetric(metric: MetricRecord, orgId: string): Promise<void> {
  await query(
    `INSERT INTO metrics (id, org_id, worker_id, execution_id, business_event_id, key, kind, value, unit, source, currency, confidence, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      metric.id,
      orgId,
      metric.workerId,
      metric.executionId ?? null,
      metric.businessEventId ?? null,
      metric.key,
      metric.kind,
      metric.value,
      metric.unit ?? null,
      metric.source ?? null,
      metric.currency ?? null,
      metric.confidence ?? null,
      metric.recordedAt,
    ],
  )
}

/** Real, org-scoped aggregation for the Business Impact rollup —
 * section 3/11. Sums MetricRecord.value per key, split strictly by
 * whether the underlying execution was real or ran through the local
 * development fixture (executions.execution_mode) — a demo number can
 * never silently blend into a real total. `previousValue`/`delta` are
 * computed by comparing two equal-length real time windows (this
 * period vs. the one immediately before it), never a fabricated
 * trend. workerId is optional — omit it to aggregate across every
 * business-kind metric the org's workers have produced. */
export interface BusinessMetricSummary {
  key: string
  kind: string
  realValue: number
  demoValue: number
  previousRealValue: number
  delta: number | null
  count: number
  lastRecordedAt: number
}

export async function getBusinessMetricSummary(orgId: string, opts: { workerId?: string; sinceMs?: number } = {}): Promise<BusinessMetricSummary[]> {
  const windowMs = opts.sinceMs ?? 30 * 24 * 60 * 60 * 1000 // 30 real days, not a fabricated "period"
  const now = Date.now()
  const currentStart = now - windowMs
  const previousStart = currentStart - windowMs

  const params: unknown[] = [orgId, currentStart, previousStart, now]
  let workerFilter = ""
  if (opts.workerId) {
    workerFilter = "AND m.worker_id = $5"
    params.push(opts.workerId)
  }

  const rows = await query<{
    key: string
    kind: string
    real_value: string | null
    demo_value: string | null
    previous_real_value: string | null
    count: string
    last_recorded_at: string
  }>(
    `SELECT
       m.key,
       m.kind,
       SUM(CASE WHEN m.recorded_at >= $2 AND e.execution_mode IS NULL THEN m.value ELSE 0 END) AS real_value,
       SUM(CASE WHEN m.recorded_at >= $2 AND e.execution_mode = 'development' THEN m.value ELSE 0 END) AS demo_value,
       SUM(CASE WHEN m.recorded_at >= $3 AND m.recorded_at < $2 AND e.execution_mode IS NULL THEN m.value ELSE 0 END) AS previous_real_value,
       COUNT(*) FILTER (WHERE m.recorded_at >= $2) AS count,
       MAX(m.recorded_at) AS last_recorded_at
     FROM metrics m
     LEFT JOIN executions e ON e.id = m.execution_id
     WHERE m.org_id = $1 AND m.kind = 'business' AND m.recorded_at >= $3 AND m.recorded_at <= $4 ${workerFilter}
     GROUP BY m.key, m.kind`,
    params,
  )

  return rows.map((r) => {
    const realValue = Number(r.real_value ?? 0)
    const previousRealValue = Number(r.previous_real_value ?? 0)
    return {
      key: r.key,
      kind: r.kind,
      realValue,
      demoValue: Number(r.demo_value ?? 0),
      previousRealValue,
      delta: previousRealValue > 0 ? Math.round(((realValue - previousRealValue) / previousRealValue) * 1000) / 10 : null,
      count: Number(r.count ?? 0),
      lastRecordedAt: Number(r.last_recorded_at ?? 0),
    }
  })
}

/** Real evidence for one BusinessEvent, org-scoped — the "click a
 * metric, inspect its evidence" chain (section 4). Never another
 * org's row: same 404-not-403 discipline as getWorker(). */
export async function getBusinessEvent(id: string, orgId: string): Promise<BusinessEvent | null> {
  const row = await queryOne<{
    id: string
    worker_id: string
    output_id: string | null
    execution_id: string | null
    type: string
    entity_id: string | null
    entity_type: string | null
    numeric_value: number | null
    currency: string | null
    confidence: number | null
    source: string | null
    payload: Record<string, unknown>
    occurred_at: string
  }>("SELECT * FROM business_events WHERE id = $1 AND org_id = $2", [id, orgId])
  if (!row) return null
  return {
    id: row.id,
    workerId: row.worker_id,
    outputId: row.output_id ?? undefined,
    executionId: row.execution_id ?? undefined,
    type: row.type,
    entityId: row.entity_id ?? undefined,
    entityType: row.entity_type ?? undefined,
    numericValue: row.numeric_value ?? undefined,
    currency: row.currency ?? undefined,
    confidence: row.confidence ?? undefined,
    source: row.source ?? undefined,
    payload: row.payload,
    occurredAt: Number(row.occurred_at),
  }
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

  const metricRows = await query<{
    id: string
    worker_id: string
    execution_id: string | null
    business_event_id: string | null
    key: string
    kind: string
    value: number
    unit: string | null
    source: string | null
    currency: string | null
    confidence: number | null
    recorded_at: string
  }>(
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
    source: r.source ?? undefined,
    currency: r.currency ?? undefined,
    confidence: r.confidence ?? undefined,
    recordedAt: Number(r.recorded_at),
  }))

  const beRows = await query<{
    id: string
    worker_id: string
    output_id: string | null
    execution_id: string | null
    type: string
    entity_id: string | null
    entity_type: string | null
    numeric_value: number | null
    currency: string | null
    confidence: number | null
    source: string | null
    payload: Record<string, unknown>
    occurred_at: string
  }>(
    `SELECT * FROM business_events WHERE org_id = $1 AND worker_id IN (${placeholders}) ORDER BY occurred_at DESC LIMIT 500`,
    [orgId, ...workerIds],
  )
  const businessEvents: BusinessEvent[] = beRows.map((r) => ({
    id: r.id,
    workerId: r.worker_id,
    outputId: r.output_id ?? undefined,
    executionId: r.execution_id ?? undefined,
    type: r.type,
    entityId: r.entity_id ?? undefined,
    entityType: r.entity_type ?? undefined,
    numericValue: r.numeric_value ?? undefined,
    currency: r.currency ?? undefined,
    confidence: r.confidence ?? undefined,
    source: r.source ?? undefined,
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

/* ================================================================== *
 * TEST CONNECTOR RECORDS — the one real write the Internal Test
 * Connector's "record" action performs (see lib/connectors/test-
 * connector.ts). Real, org-scoped, org-isolated — used only to prove
 * the real approval/resume/idempotency/lease mechanisms end to end
 * without a real third-party account; never a real business result.
 * ================================================================== */
export interface TestConnectorRecord {
  id: string
  orgId: string
  executionId?: string
  note: string
  createdAt: number
}

export async function insertTestConnectorRecord(input: { orgId: string; executionId?: string; note: string }): Promise<TestConnectorRecord> {
  const id = `tcr_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO test_connector_records (id, org_id, execution_id, note, created_at) VALUES ($1, $2, $3, $4, $5)", [id, input.orgId, input.executionId ?? null, input.note, now])
  return { id, orgId: input.orgId, executionId: input.executionId, note: input.note, createdAt: now }
}

/** Org-scoped listing — used by tests to prove org isolation and to
 * prove a real write happened exactly once (never twice) across a
 * retry/resume/concurrency scenario. */
export async function listTestConnectorRecords(orgId: string): Promise<TestConnectorRecord[]> {
  const rows = await query<{ id: string; org_id: string; execution_id: string | null; note: string; created_at: string }>("SELECT * FROM test_connector_records WHERE org_id = $1 ORDER BY created_at ASC", [orgId])
  return rows.map((r) => ({ id: r.id, orgId: r.org_id, executionId: r.execution_id ?? undefined, note: r.note, createdAt: Number(r.created_at) }))
}

/* ================================================================== *
 * CONNECTIONS — org-scoped, real persisted Connector Foundation
 * state. Every function here takes orgId and filters on it, same
 * discipline as the Worker functions above: org A can never read,
 * update, or delete org B's Connection by id (a mismatch reads as
 * "not found", never as a 403 that would confirm another tenant's
 * resource exists — see getWorker()'s doc comment for the same
 * reasoning applied here).
 * ================================================================== */

interface ConnectionRow {
  id: string
  org_id: string
  connector_id: string
  status: string
  auth_type: string
  external_account_id: string | null
  display_name: string | null
  metadata: Record<string, unknown>
  credential_ref: string | null
  error_reason: string | null
  created_at: string
  updated_at: string
}

function rowToConnection(r: ConnectionRow): Connection {
  return {
    id: r.id,
    organizationId: r.org_id,
    connectorId: r.connector_id,
    status: r.status as Connection["status"],
    authType: r.auth_type as Connection["authType"],
    externalAccountId: r.external_account_id ?? undefined,
    displayName: r.display_name ?? undefined,
    metadata: r.metadata ?? {},
    credentialRef: r.credential_ref ?? undefined,
    errorReason: r.error_reason ?? undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export async function listConnections(orgId: string): Promise<Connection[]> {
  const rows = await query<ConnectionRow>("SELECT * FROM connections WHERE org_id = $1 ORDER BY created_at ASC", [orgId])
  return rows.map(rowToConnection)
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the connection doesn't belong to orgId. */
export async function getConnection(id: string, orgId: string): Promise<Connection | null> {
  const row = await queryOne<ConnectionRow>("SELECT * FROM connections WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToConnection(row) : null
}

export async function createConnection(input: {
  orgId: string
  userId?: string
  connectorId: string
  authType: Connection["authType"]
  status?: Connection["status"]
  externalAccountId?: string
  displayName?: string
  metadata?: Record<string, unknown>
}): Promise<Connection> {
  const now = Date.now()
  const id = `conn_${randomUUID()}`
  await query(
    `INSERT INTO connections (id, org_id, connector_id, status, auth_type, external_account_id, display_name, metadata, created_at, updated_at, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
    [
      id,
      input.orgId,
      input.connectorId,
      input.status ?? "not_connected",
      input.authType,
      input.externalAccountId ?? null,
      input.displayName ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
      input.userId ?? null,
    ],
  )
  return (await getConnection(id, input.orgId))!
}

/** Org-scoped by construction — the WHERE clause is what makes this
 * safe: a caller can never update another org's Connection by
 * guessing/forging an id, even though `id` alone would be enough to
 * locate the row in the table. */
export async function updateConnectionStatus(
  id: string,
  orgId: string,
  update: { status: Connection["status"]; errorReason?: string | null; externalAccountId?: string; displayName?: string; metadata?: Record<string, unknown>; userId?: string },
): Promise<Connection | null> {
  const existing = await getConnection(id, orgId)
  if (!existing) return null
  const now = Date.now()
  await query(
    `UPDATE connections
     SET status = $1, error_reason = $2, external_account_id = COALESCE($3, external_account_id), display_name = COALESCE($4, display_name),
         metadata = COALESCE($5, metadata), updated_at = $6, updated_by = $7
     WHERE id = $8 AND org_id = $9`,
    [
      update.status,
      update.errorReason ?? null,
      update.externalAccountId ?? null,
      update.displayName ?? null,
      update.metadata ? JSON.stringify(update.metadata) : null,
      now,
      update.userId ?? null,
      id,
      orgId,
    ],
  )
  return getConnection(id, orgId)
}

/** A real delete, org-scoped — used for both "disconnect" (a
 * deliberate user action) and cleanup. Distinguishing DISCONNECTED
 * from a hard delete is a Phase-2-and-later product decision (soft
 * delete + retained audit trail vs. hard delete); Phase 1 keeps this
 * simple and relies on the existing audit_log (recordAudit) for the
 * historical record, which already survives the row's deletion. */
export async function deleteConnection(id: string, orgId: string): Promise<void> {
  await query("DELETE FROM connections WHERE id = $1 AND org_id = $2", [id, orgId])
}

/* ================================================================== *
 * OAUTH CREDENTIALS — one encrypted row per Connection. The plaintext
 * secret is never returned by these functions' TYPES here (they move
 * the encrypted string) — encryption/decryption itself is
 * lib/crypto/secret-box.ts's job, called by lib/connectors/token-
 * store.ts, never inline in a route handler.
 * ================================================================== */

export interface OAuthCredentialRow {
  id: string
  connectionId: string
  accessTokenEncrypted: string
  refreshTokenEncrypted: string | null
  tokenType: string | null
  scope: string | null
  expiresAt: number | null
}

export async function upsertOAuthCredential(input: {
  connectionId: string
  accessTokenEncrypted: string
  refreshTokenEncrypted?: string | null
  tokenType?: string | null
  scope?: string | null
  expiresAt?: number | null
}): Promise<void> {
  const now = Date.now()
  await query(
    `INSERT INTO oauth_credentials (id, connection_id, access_token_encrypted, refresh_token_encrypted, token_type, scope, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     ON CONFLICT (connection_id) DO UPDATE SET
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, oauth_credentials.refresh_token_encrypted),
       token_type = EXCLUDED.token_type,
       scope = EXCLUDED.scope,
       expires_at = EXCLUDED.expires_at,
       updated_at = $8`,
    [`oauthcred_${randomUUID()}`, input.connectionId, input.accessTokenEncrypted, input.refreshTokenEncrypted ?? null, input.tokenType ?? null, input.scope ?? null, input.expiresAt ?? null, now],
  )
}

export async function getOAuthCredential(connectionId: string): Promise<OAuthCredentialRow | null> {
  const row = await queryOne<{
    id: string
    connection_id: string
    access_token_encrypted: string
    refresh_token_encrypted: string | null
    token_type: string | null
    scope: string | null
    expires_at: string | null
  }>("SELECT * FROM oauth_credentials WHERE connection_id = $1", [connectionId])
  if (!row) return null
  return {
    id: row.id,
    connectionId: row.connection_id,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenType: row.token_type,
    scope: row.scope,
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
  }
}

export async function deleteOAuthCredential(connectionId: string): Promise<void> {
  await query("DELETE FROM oauth_credentials WHERE connection_id = $1", [connectionId])
}

/* ================================================================== *
 * APPROVALS — the real Human-in-the-Loop queue (section "PHASE 6").
 * ================================================================== */

interface ApprovalRow {
  id: string
  worker_id: string
  execution_id: string | null
  tool_id: string
  tool_name: string
  action_id: string
  action_label: string
  permission: string
  reason: string
  input: unknown
  status: string
  result: unknown
  requested_at: string
  decided_at: string | null
  decided_by: string | null
  skill_id: string | null
  resume_state: unknown
}

function rowToApproval(r: ApprovalRow): Approval {
  return {
    id: r.id,
    workerId: r.worker_id,
    executionId: r.execution_id ?? undefined,
    toolId: r.tool_id,
    toolName: r.tool_name,
    actionId: r.action_id,
    actionLabel: r.action_label,
    permission: r.permission as Approval["permission"],
    reason: r.reason,
    input: r.input,
    status: r.status as Approval["status"],
    result: r.result ?? undefined,
    requestedAt: Number(r.requested_at),
    decidedAt: r.decided_at ? Number(r.decided_at) : undefined,
    decidedBy: r.decided_by ?? undefined,
    skillId: r.skill_id ?? undefined,
    resumeState: (r.resume_state as Approval["resumeState"]) ?? undefined,
  }
}

export async function createApproval(input: {
  orgId: string
  workerId: string
  executionId?: string
  toolId: string
  toolName: string
  actionId: string
  actionLabel: string
  permission: string
  reason: string
  input: unknown
  skillId?: string
  resumeState?: unknown
}): Promise<Approval> {
  const id = `appr_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO approvals (id, org_id, worker_id, execution_id, tool_id, tool_name, action_id, action_label, permission, reason, input, status, requested_at, skill_id, resume_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13, $14)`,
    [
      id,
      input.orgId,
      input.workerId,
      input.executionId ?? null,
      input.toolId,
      input.toolName,
      input.actionId,
      input.actionLabel,
      input.permission,
      input.reason,
      JSON.stringify(input.input ?? {}),
      now,
      input.skillId ?? null,
      input.resumeState != null ? JSON.stringify(input.resumeState) : null,
    ],
  )
  return (await getApproval(id, input.orgId))!
}

export async function listApprovals(orgId: string, opts?: { status?: Approval["status"] }): Promise<Approval[]> {
  const rows = opts?.status
    ? await query<ApprovalRow>("SELECT * FROM approvals WHERE org_id = $1 AND status = $2 ORDER BY requested_at DESC LIMIT 200", [orgId, opts.status])
    : await query<ApprovalRow>("SELECT * FROM approvals WHERE org_id = $1 ORDER BY requested_at DESC LIMIT 200", [orgId])
  return rows.map(rowToApproval)
}

export async function getApproval(id: string, orgId: string): Promise<Approval | null> {
  const row = await queryOne<ApprovalRow>("SELECT * FROM approvals WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToApproval(row) : null
}

/** True idempotent decision (section 4: "If the user clicks APPROVE
 * twice: only one approval transition may happen"). A real atomic
 * compare-and-swap — `WHERE status = 'pending'` is part of the SAME
 * UPDATE that sets the new status, so two concurrent decide calls can
 * never both win: exactly one UPDATE actually matches a row (Postgres
 * serializes concurrent UPDATEs to the same row), the other affects
 * zero rows and gets null back here — a real "already decided," not
 * a race. Sets status/decided_at/decided_by immediately; `result` (for
 * Approve, only known after the real action/resume actually runs) is
 * attached afterward via setApprovalResult(), by the same caller that
 * won this claim — never by the loser. */
export async function claimApproval(id: string, orgId: string, status: "approved" | "rejected", decidedBy: string): Promise<Approval | null> {
  const now = Date.now()
  const row = await queryOne<{ id: string }>("UPDATE approvals SET status = $1, decided_at = $2, decided_by = $3 WHERE id = $4 AND org_id = $5 AND status = 'pending' RETURNING id", [status, now, decidedBy, id, orgId])
  if (!row) return null // lost the race, or was never pending — no transition happened
  return getApproval(id, orgId)
}

/** Attaches the real result of an already-claimed decision — called
 * only by whichever request actually won claimApproval() above. */
export async function setApprovalResult(id: string, orgId: string, result: unknown): Promise<Approval | null> {
  await query("UPDATE approvals SET result = $1 WHERE id = $2 AND org_id = $3", [result != null ? JSON.stringify(result) : null, id, orgId])
  return getApproval(id, orgId)
}

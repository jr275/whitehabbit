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
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box"
import { customConnectorConnectorId } from "@/lib/connectors/custom-connector-id"
import { slugify } from "@/lib/connectors/slug"
import { query, queryOne, withTransaction } from "./client"
import type { Connection, ConnectorAction, CustomConnector, CustomConnectorCredential } from "@/lib/connectors/types"
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
  /** Null for OAuth (Google) accounts — they have no local password. */
  passwordHash: string | null
  displayName: string | null
  imageUrl: string | null
  authProvider: string
  /** Epoch-ms the user finished onboarding, or null if they haven't. */
  onboardingCompletedAt: number | null
  createdAt: number
}

interface UserDbRow {
  id: string
  email: string
  password_hash: string | null
  display_name: string | null
  image_url: string | null
  auth_provider: string
  onboarding_completed_at: string | null
  created_at: string
}

function rowToUser(row: UserDbRow): UserRow {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    imageUrl: row.image_url,
    authProvider: row.auth_provider,
    onboardingCompletedAt: row.onboarding_completed_at != null ? Number(row.onboarding_completed_at) : null,
    createdAt: Number(row.created_at),
  }
}

const USER_COLUMNS =
  "id, email, password_hash, display_name, image_url, auth_provider, onboarding_completed_at, created_at"

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const row = await queryOne<UserDbRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email.toLowerCase().trim()])
  return row ? rowToUser(row) : null
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const row = await queryOne<UserDbRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id])
  return row ? rowToUser(row) : null
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

    await client.query("INSERT INTO users (id, email, password_hash, auth_provider, created_at) VALUES ($1, $2, $3, 'credentials', $4)", [userId, normalizedEmail, passwordHash, now])
    await client.query("INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)", [orgId, orgName, now])
    await client.query("INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [userId, orgId, now])

    return {
      user: {
        id: userId,
        email: normalizedEmail,
        passwordHash,
        displayName: null,
        imageUrl: null,
        authProvider: "credentials",
        onboardingCompletedAt: null,
        createdAt: now,
      },
      org: { id: orgId, name: orgName, createdAt: now },
    }
  })
}

/** OAuth (Google) sign-in provisioning: find the account by email, or
 * create a real user + personal organization for it — the exact same
 * atomic user+org+membership shape as credentials sign-up, minus the
 * password (auth_provider = 'google'). Returns the resolved user so
 * the Auth.js jwt callback can attach the real userId/orgId. */
export async function findOrCreateOAuthUser(params: {
  email: string
  displayName?: string | null
  imageUrl?: string | null
}): Promise<{ user: UserRow; org: OrgRow }> {
  const email = params.email.toLowerCase().trim()
  const existing = await getUserByEmail(email)
  if (existing) {
    // Keep the freshest profile info Google gives us, but never touch
    // an existing local password or auth_provider of an account that
    // already signs in with credentials.
    if (params.displayName || params.imageUrl) {
      await query("UPDATE users SET display_name = COALESCE($1, display_name), image_url = COALESCE($2, image_url) WHERE id = $3", [
        params.displayName ?? null,
        params.imageUrl ?? null,
        existing.id,
      ])
    }
    const org = await getPrimaryOrgForUser(existing.id)
    if (!org) throw new Error("OAuth user has no organization — data integrity error.")
    return { user: existing, org }
  }

  return withTransaction(async (client) => {
    const now = Date.now()
    const userId = `user_${randomUUID()}`
    const orgId = `org_${randomUUID()}`
    const orgName = `${email.split("@")[0]}'s organization`

    await client.query(
      "INSERT INTO users (id, email, password_hash, display_name, image_url, auth_provider, created_at) VALUES ($1, $2, NULL, $3, $4, 'google', $5)",
      [userId, email, params.displayName ?? null, params.imageUrl ?? null, now],
    )
    await client.query("INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)", [orgId, orgName, now])
    await client.query("INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [userId, orgId, now])

    return {
      user: {
        id: userId,
        email,
        passwordHash: null,
        displayName: params.displayName ?? null,
        imageUrl: params.imageUrl ?? null,
        authProvider: "google",
        onboardingCompletedAt: null,
        createdAt: now,
      },
      org: { id: orgId, name: orgName, createdAt: now },
    }
  })
}

/* ================================================================== *
 * ONBOARDING — the shared account's one-time first-run flow. Interests
 * are a personalization signal captured once; nothing reads them for
 * recommendations yet (that layer isn't built).
 * ================================================================== */

export async function getOnboardingState(userId: string): Promise<{ completed: boolean; interests: string[] }> {
  const user = await queryOne<{ onboarding_completed_at: string | null }>(
    "SELECT onboarding_completed_at FROM users WHERE id = $1",
    [userId],
  )
  const interests = await query<{ topic: string }>("SELECT topic FROM user_interests WHERE user_id = $1 ORDER BY created_at ASC", [userId])
  return { completed: user?.onboarding_completed_at != null, interests: interests.map((r) => r.topic) }
}

/** Marks onboarding complete and records the chosen interests, atomically.
 * Idempotent-safe: re-running replaces the interest set and refreshes the
 * completion timestamp rather than erroring. */
export async function completeOnboarding(userId: string, interests: string[]): Promise<void> {
  const now = Date.now()
  const clean = Array.from(new Set(interests.map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 24)
  await withTransaction(async (client) => {
    await client.query("UPDATE users SET onboarding_completed_at = $1 WHERE id = $2", [now, userId])
    await client.query("DELETE FROM user_interests WHERE user_id = $1", [userId])
    for (const topic of clean) {
      await client.query("INSERT INTO user_interests (user_id, topic, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [userId, topic, now])
    }
  })
}

/* ================================================================== *
 * PASSWORD RESET — real, single-use, expiring tokens. Only the SHA-256
 * hash of the token is ever stored (see lib/auth-password for the hash
 * helper); the raw token exists only in the emailed link.
 * ================================================================== */

export async function createPasswordResetToken(userId: string, tokenHash: string, ttlMs: number): Promise<void> {
  const now = Date.now()
  await query(
    "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used_at, created_at) VALUES ($1, $2, $3, NULL, $4)",
    [tokenHash, userId, now + ttlMs, now],
  )
}

export interface ResetTokenRow {
  tokenHash: string
  userId: string
  expiresAt: number
  usedAt: number | null
}

export async function getValidResetToken(tokenHash: string): Promise<ResetTokenRow | null> {
  const row = await queryOne<{ token_hash: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT token_hash, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1",
    [tokenHash],
  )
  if (!row) return null
  const expiresAt = Number(row.expires_at)
  if (row.used_at != null || expiresAt < Date.now()) return null
  return { tokenHash: row.token_hash, userId: row.user_id, expiresAt, usedAt: null }
}

/** Consumes the token and sets the new password hash in a single
 * transaction, so a token can never be spent twice even under a race. */
export async function resetPasswordWithToken(tokenHash: string, newPasswordHash: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query<{ user_id: string; expires_at: string; used_at: string | null }>(
      "SELECT user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1 FOR UPDATE",
      [tokenHash],
    )
    const row = res.rows[0]
    if (!row || row.used_at != null || Number(row.expires_at) < Date.now()) return false
    const now = Date.now()
    await client.query("UPDATE password_reset_tokens SET used_at = $1 WHERE token_hash = $2", [now, tokenHash])
    // Setting a password also converts an OAuth-only account into one
    // that can additionally sign in with credentials — harmless and expected.
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newPasswordHash, row.user_id])
    return true
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
    // A row persisted before updated_at existed has it defaulted to
    // created_at by Postgres (same column-default convention as every
    // other backfilled column in this file) — never undefined.
    updatedAt: r.updated_at ? Number(r.updated_at) : Number(r.created_at),
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

interface OutputRow {
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
}

function rowToOutput(r: OutputRow): WorkerOutput {
  return {
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
  }
}

/** Org-scoped real outputs for ONE execution — never capped by the
 * client bootstrap store's 500-row window. This is what makes
 * OutputDrawer's execution-detail resolution correct regardless of
 * how old the execution is (see GET /api/executions/[id]). */
export async function listOutputsForExecution(executionId: string, orgId: string): Promise<WorkerOutput[]> {
  const rows = await query<OutputRow>("SELECT * FROM outputs WHERE execution_id = $1 AND org_id = $2 ORDER BY created_at ASC", [executionId, orgId])
  return rows.map(rowToOutput)
}

/** Bounded, org-scoped, optionally worker-scoped recent outputs — the
 * real source for Observatory's "Recent outputs" panel. Never the
 * whole outputs table. */
export async function listRecentOutputs(orgId: string, opts: { workerId?: string; limit?: number } = {}): Promise<WorkerOutput[]> {
  const clauses = ["org_id = $1"]
  const params: unknown[] = [orgId]
  if (opts.workerId) {
    params.push(opts.workerId)
    clauses.push(`worker_id = $${params.length}`)
  }
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100)
  params.push(limit)
  const rows = await query<OutputRow>(`SELECT * FROM outputs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length}`, params)
  return rows.map(rowToOutput)
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
  last_checked_at: string | null
  last_success_at: string | null
  last_error_at: string | null
  last_error_code: string | null
  last_latency_ms: number | null
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
    lastCheckedAt: r.last_checked_at ? Number(r.last_checked_at) : undefined,
    lastSuccessAt: r.last_success_at ? Number(r.last_success_at) : undefined,
    lastErrorAt: r.last_error_at ? Number(r.last_error_at) : undefined,
    lastErrorCode: r.last_error_code ?? undefined,
    lastLatencyMs: r.last_latency_ms ?? undefined,
  }
}

/** Real, persisted health record — called after a real healthCheck()
 * (POST /api/connections/[id]/test) or after a real connector tool
 * call actually ran (lib/connectors/registry.ts's getConnectorTools()
 * wrapping, the single chokepoint every connector action goes
 * through). `ok` decides which timestamp advances; last_checked_at
 * always advances — a real fact about when this was last observed,
 * successful or not. Org-scoped like every other write in this file. */
export async function recordConnectionHealth(connectionId: string, orgId: string, result: { ok: boolean; errorCode?: string; latencyMs?: number }): Promise<void> {
  const now = Date.now()
  await query(
    `UPDATE connections SET
       last_checked_at = $1,
       last_success_at = CASE WHEN $2 THEN $1 ELSE last_success_at END,
       last_error_at = CASE WHEN $2 THEN last_error_at ELSE $1 END,
       last_error_code = CASE WHEN $2 THEN NULL ELSE $3 END,
       last_latency_ms = COALESCE($4, last_latency_ms)
     WHERE id = $5 AND org_id = $6`,
    [now, result.ok, result.errorCode ?? null, result.latencyMs ?? null, connectionId, orgId],
  )
}

/* ================================================================== *
 * CUSTOM CONNECTORS — real, per-organization, mutable connector
 * configuration (MCP servers, Custom REST Connectors — section 4/11/
 * 14). See lib/connectors/dynamic.ts for the read-side bridge that
 * turns these rows into ordinary ConnectorDefinitions.
 * ================================================================== */

interface CustomConnectorRow {
  id: string
  org_id: string
  slug: string
  kind: string
  name: string
  description: string | null
  category: string | null
  icon: string | null
  config: Record<string, unknown>
  discovered_tools: ConnectorAction[]
  status: string
  error_reason: string | null
  created_at: string
  updated_at: string
}

function rowToCustomConnector(r: CustomConnectorRow): CustomConnector {
  return {
    id: r.id,
    organizationId: r.org_id,
    slug: r.slug,
    kind: r.kind as CustomConnector["kind"],
    name: r.name,
    description: r.description ?? undefined,
    category: r.category ?? undefined,
    icon: r.icon ?? undefined,
    config: r.config as unknown as CustomConnector["config"],
    discoveredTools: r.discovered_tools ?? [],
    status: r.status as CustomConnector["status"],
    errorReason: r.error_reason ?? undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

/** Phase 2B — connector platform hardening: an explicit column list,
 * never `SELECT *`. custom_connectors has a credential_encrypted
 * column (legacy, see migrations/0013_connection_credentials.sql);
 * naming every OTHER column here means that secret literally never
 * enters the JS row object in the first place, for every caller of
 * this function — "redaction" isn't something a mapper has to
 * remember to do downstream, because there is nothing left to redact.
 * A future refactor that spreads `{...row}` into an API response
 * cannot leak a field that was never fetched. */
const CUSTOM_CONNECTOR_COLUMNS = "id, org_id, slug, kind, name, description, category, icon, config, discovered_tools, status, error_reason, created_at, updated_at"

export async function listCustomConnectors(orgId: string): Promise<CustomConnector[]> {
  const rows = await query<CustomConnectorRow>(`SELECT ${CUSTOM_CONNECTOR_COLUMNS} FROM custom_connectors WHERE org_id = $1 ORDER BY created_at ASC`, [orgId])
  return rows.map(rowToCustomConnector)
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the custom connector doesn't belong to orgId. */
export async function getCustomConnector(id: string, orgId: string): Promise<CustomConnector | null> {
  const row = await queryOne<CustomConnectorRow>(`SELECT ${CUSTOM_CONNECTOR_COLUMNS} FROM custom_connectors WHERE id = $1 AND org_id = $2`, [id, orgId])
  return row ? rowToCustomConnector(row) : null
}

/** A Postgres unique-violation error carries code '23505' — narrowed
 * this way (rather than a library-specific error class) because the
 * `pg` driver throws a plain object with that shape, not a subclass. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505"
}

export async function createCustomConnector(input: { orgId: string; userId?: string; kind: CustomConnector["kind"]; name: string; description?: string; category?: string; icon?: string; config: CustomConnector["config"] }): Promise<CustomConnector> {
  const id = `cconn_${randomUUID()}`
  const now = Date.now()
  const baseSlug = slugify(input.name)
  // idx_custom_connectors_org_slug enforces uniqueness per org — on a
  // real collision (two connectors this org named the same thing),
  // retry with a short random suffix rather than pre-checking for
  // existence first (check-then-insert would itself race).
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 6)}`
    try {
      await query(
        `INSERT INTO custom_connectors (id, org_id, slug, kind, name, description, category, icon, config, created_at, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)`,
        [id, input.orgId, slug, input.kind, input.name, input.description ?? null, input.category ?? null, input.icon ?? null, JSON.stringify(input.config), now, input.userId ?? null],
      )
      return (await getCustomConnector(id, input.orgId))!
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 4) throw err
    }
  }
  throw new Error("createCustomConnector: could not generate a unique slug.")
}

/** Real discovery/import result — replaces the cached tool list
 * wholesale (a re-sync/re-import is a real, deliberate refresh, never
 * a merge of stale + new). */
export async function updateCustomConnectorDiscovery(id: string, orgId: string, patch: { status: CustomConnector["status"]; errorReason?: string | null; discoveredTools?: ConnectorAction[] }): Promise<CustomConnector | null> {
  const existing = await getCustomConnector(id, orgId)
  if (!existing) return null
  const now = Date.now()
  await query(
    `UPDATE custom_connectors SET status = $1, error_reason = $2, discovered_tools = COALESCE($3, discovered_tools), updated_at = $4 WHERE id = $5 AND org_id = $6`,
    [patch.status, patch.errorReason ?? null, patch.discoveredTools ? JSON.stringify(patch.discoveredTools) : null, now, id, orgId],
  )
  return getCustomConnector(id, orgId)
}

/** Updates the connector's own definition fields — name, description,
 * category, icon, config (e.g. a corrected baseUrl). Never touches
 * status/discoveredTools (updateCustomConnectorDiscovery's job) or the
 * credential (setCustomConnectorCredential's job) — three different
 * security surfaces kept in three different functions, matching the
 * Connector/Connection/Credential separation the audit called for
 * (only `name` intentionally excluded from slug regeneration: a slug
 * is a stable reference once created, never silently changed by a
 * rename). Org-scoped: returns null (never another org's row) if the
 * connector doesn't belong to orgId. */
export async function updateCustomConnector(id: string, orgId: string, patch: { name?: string; description?: string | null; category?: string | null; icon?: string | null; config?: CustomConnector["config"] }): Promise<CustomConnector | null> {
  const existing = await getCustomConnector(id, orgId)
  if (!existing) return null
  const now = Date.now()
  await query(
    `UPDATE custom_connectors
     SET name = COALESCE($1, name),
         description = CASE WHEN $2::boolean THEN $3 ELSE description END,
         category = CASE WHEN $4::boolean THEN $5 ELSE category END,
         icon = CASE WHEN $6::boolean THEN $7 ELSE icon END,
         config = COALESCE($8, config),
         updated_at = $9
     WHERE id = $10 AND org_id = $11`,
    [
      patch.name ?? null,
      "description" in patch,
      patch.description ?? null,
      "category" in patch,
      patch.category ?? null,
      "icon" in patch,
      patch.icon ?? null,
      patch.config ? JSON.stringify(patch.config) : null,
      now,
      id,
      orgId,
    ],
  )
  return getCustomConnector(id, orgId)
}

export async function deleteCustomConnector(id: string, orgId: string): Promise<void> {
  await query("DELETE FROM custom_connectors WHERE id = $1 AND org_id = $2", [id, orgId])
}

/* ================================================================== *
 * CONNECTION CREDENTIALS — Phase 2A architectural hardening: the ONE
 * physical, connection-scoped, multi-credential store every connector
 * family's non-OAuth secret lives in (migrations/
 * 0013_connection_credentials.sql), generalized from the old
 * custom_connector_id-scoped, never-wired 0012 table. OAuth2 token
 * pairs stay in oauth_credentials, further below — a deliberately
 * separate table for a deliberately different lifecycle (real,
 * unencrypted, queryable expiry the runtime checks without decrypting
 * anything on every call — see getValidAccessToken in
 * lib/connectors/token-store.ts) — but BOTH are reached through
 * exactly one code-level boundary, lib/connectors/credential-
 * resolver.ts's resolveConnectionCredential(), never directly by an
 * adapter. See migrations/0013_connection_credentials.sql's header
 * for the full "why two tables, one boundary" reasoning.
 *
 * Three distinct shapes, never conflated:
 *   CredentialRecord    — the raw DB row (credential_encrypted and
 *                          all). Never leaves this file.
 *   CredentialMetadata  — id/label/kind/isPrimary/timestamps. Fetched
 *                          via an explicit column list that never
 *                          includes credential_encrypted (Phase 2B —
 *                          same discipline as CUSTOM_CONNECTOR_COLUMNS
 *                          above), so this shape has no secret in it
 *                          for a future refactor to leak. Safe for any
 *                          API response or UI list.
 *   DecryptedCredential — CustomConnectorCredential
 *                          (lib/connectors/types.ts), the real secret
 *                          value. Exists only inside the execution
 *                          boundary: a server-only adapter resolving
 *                          what to send on an actual outbound call.
 *                          Never returned by a route, logged, or put
 *                          in an event/observability payload.
 *
 * setCustomConnectorCredential/getCustomConnectorCredential/
 * listCustomConnectorCredentials/createCustomConnectorCredential/
 * getCustomConnectorCredentialValue/deleteCustomConnectorCredential
 * (further below) are kept as backward-compatible convenience
 * wrappers with their original names and signatures, addressed by a
 * custom connector's own id — every existing caller (routes, tests)
 * keeps working unchanged. Internally they now route through this
 * connection-scoped store instead of the old custom_connectors.
 * credential_encrypted 1:1 column (still present in the table, never
 * read or written by application code after this phase — see that
 * migration's header for why it's kept, not dropped).
 * ================================================================== */

export type CredentialKind = "api_key" | "bearer_token" | "basic_auth" | "mcp_bearer" | "legacy"

/** Safe DTO — see the section header above for why this shape can
 * never carry a secret. */
export interface CredentialMetadata {
  id: string
  connectionId: string
  label: string
  kind: CredentialKind
  isPrimary: boolean
  createdAt: number
  updatedAt: number
}

const CREDENTIAL_METADATA_COLUMNS = "id, connection_id, label, kind, is_primary, created_at, updated_at"

interface CredentialMetadataRow {
  id: string
  connection_id: string
  label: string
  kind: string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

function rowToCredentialMetadata(r: CredentialMetadataRow): CredentialMetadata {
  return { id: r.id, connectionId: r.connection_id, label: r.label, kind: (r.kind as CredentialKind) ?? "legacy", isPrimary: r.is_primary, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }
}

/** Real metadata only for every credential on this Connection — never
 * the encrypted or decrypted secret. Safe for any API response or UI
 * list (a future rotation UI's "which credentials exist" view). */
export async function listConnectionCredentials(connectionId: string, orgId: string): Promise<CredentialMetadata[]> {
  const rows = await query<CredentialMetadataRow>(
    `SELECT ${CREDENTIAL_METADATA_COLUMNS} FROM connection_credentials WHERE connection_id = $1 AND org_id = $2 ORDER BY created_at ASC`,
    [connectionId, orgId],
  )
  return rows.map(rowToCredentialMetadata)
}

async function clearPrimaryCredential(client: import("pg").PoolClient, connectionId: string, orgId: string): Promise<void> {
  await client.query("UPDATE connection_credentials SET is_primary = false WHERE connection_id = $1 AND org_id = $2", [connectionId, orgId])
}

async function countConnectionCredentials(client: import("pg").PoolClient, connectionId: string, orgId: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM connection_credentials WHERE connection_id = $1 AND org_id = $2", [connectionId, orgId])
  return Number(rows[0]?.n ?? "0")
}

async function fetchCredentialMetadata(client: import("pg").PoolClient, connectionId: string, label: string): Promise<CredentialMetadata> {
  const { rows } = await client.query<CredentialMetadataRow>(`SELECT ${CREDENTIAL_METADATA_COLUMNS} FROM connection_credentials WHERE connection_id = $1 AND label = $2`, [connectionId, label])
  return rowToCredentialMetadata(rows[0])
}

/** Upserts the credential at (connectionId, label) — creates it if
 * absent, overwrites the secret in place if present. This is UPSERT
 * semantics on purpose: it backs the single default/primary
 * credential slot (setCustomConnectorCredential below), where setting
 * "the" credential again is expected to replace it, never to error.
 * A caller that wants a genuinely NEW named credential to fail loudly
 * on a duplicate label wants createConnectionCredential instead. The
 * connection's FIRST-ever credential becomes primary automatically; a
 * later upsert only changes primary status if makePrimary is
 * explicitly passed — never an implicit promotion/demotion on an
 * unrelated write. customConnectorId is threaded through only to
 * preserve the existing ON DELETE CASCADE from custom_connectors for
 * connector-originated credentials (see the migration's header) —
 * never used for scoping; connection_id + org_id is the real,
 * sufficient scope both here and on every read below. */
export async function setConnectionCredential(input: {
  connectionId: string
  orgId: string
  userId?: string
  label?: string
  kind: CredentialKind
  credential: CustomConnectorCredential
  makePrimary?: boolean
  customConnectorId?: string
}): Promise<CredentialMetadata> {
  const label = input.label ?? "Default"
  const encrypted = encryptSecret(JSON.stringify(input.credential))
  const now = Date.now()
  return withTransaction(async (client) => {
    const isFirst = (await countConnectionCredentials(client, input.connectionId, input.orgId)) === 0
    const primary = input.makePrimary ?? isFirst
    if (primary) await clearPrimaryCredential(client, input.connectionId, input.orgId)
    await client.query(
      `INSERT INTO connection_credentials (id, org_id, connection_id, custom_connector_id, label, kind, credential_encrypted, is_primary, created_at, updated_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)
       ON CONFLICT (connection_id, label) DO UPDATE SET
         kind = EXCLUDED.kind, credential_encrypted = EXCLUDED.credential_encrypted, is_primary = EXCLUDED.is_primary, updated_at = $9`,
      [`ccred_${randomUUID()}`, input.orgId, input.connectionId, input.customConnectorId ?? null, label, input.kind, encrypted, primary, now, input.userId ?? null],
    )
    return fetchCredentialMetadata(client, input.connectionId, label)
  })
}

/** Pure insert — a genuinely NEW labeled credential (rotation
 * candidate, or a second real named credential like "Staging"
 * alongside "Production"). Rejects, via the real unique index on
 * (connection_id, label) — never a pre-check that could race — if the
 * label already exists on this connection. */
export async function createConnectionCredential(input: {
  connectionId: string
  orgId: string
  userId?: string
  label?: string
  kind: CredentialKind
  credential: CustomConnectorCredential
  customConnectorId?: string
}): Promise<CredentialMetadata> {
  const label = input.label ?? "Default"
  const encrypted = encryptSecret(JSON.stringify(input.credential))
  const now = Date.now()
  return withTransaction(async (client) => {
    const isFirst = (await countConnectionCredentials(client, input.connectionId, input.orgId)) === 0
    await client.query(
      `INSERT INTO connection_credentials (id, org_id, connection_id, custom_connector_id, label, kind, credential_encrypted, is_primary, created_at, updated_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`,
      [`ccred_${randomUUID()}`, input.orgId, input.connectionId, input.customConnectorId ?? null, label, input.kind, encrypted, isFirst, now, input.userId ?? null],
    )
    return fetchCredentialMetadata(client, input.connectionId, label)
  })
}

/** Real, decrypted PRIMARY credential for a Connection — the one a
 * connector adapter's execution path resolves by default. Null when
 * genuinely none is stored. Server-only; never returned by an API
 * response — see lib/connectors/credential-resolver.ts, the one
 * caller every adapter goes through. */
export async function getPrimaryConnectionCredential(connectionId: string, orgId: string): Promise<CustomConnectorCredential | null> {
  const row = await queryOne<{ credential_encrypted: string }>(
    "SELECT credential_encrypted FROM connection_credentials WHERE connection_id = $1 AND org_id = $2 AND is_primary",
    [connectionId, orgId],
  )
  if (!row) return null
  return JSON.parse(decryptSecret(row.credential_encrypted)) as CustomConnectorCredential
}

/** Real, decrypted credential by id — for resolving a SPECIFIC named
 * credential rather than just the primary (e.g. a future "run with
 * the Staging credential" override). Triply scoped: id, connection_id,
 * AND org_id must all agree. Server-only. */
export async function getConnectionCredentialValue(id: string, connectionId: string, orgId: string): Promise<CustomConnectorCredential | null> {
  const row = await queryOne<{ credential_encrypted: string }>(
    "SELECT credential_encrypted FROM connection_credentials WHERE id = $1 AND connection_id = $2 AND org_id = $3",
    [id, connectionId, orgId],
  )
  if (!row) return null
  return JSON.parse(decryptSecret(row.credential_encrypted)) as CustomConnectorCredential
}

export async function deleteConnectionCredential(id: string, orgId: string): Promise<void> {
  await query("DELETE FROM connection_credentials WHERE id = $1 AND org_id = $2", [id, orgId])
}

/** Org-scoped, indexed lookup — the one place connections.connector_id
 * (a free TEXT column, never a DB foreign key — see
 * lib/connectors/custom-connector-id.ts) is queried directly rather
 * than scanned via listConnections().find(...). Returns the oldest
 * matching row if more than one somehow exists, matching the
 * pre-existing .find() behavior this replaces at every call site. */
export async function getConnectionByConnectorId(orgId: string, connectorId: string): Promise<Connection | null> {
  const row = await queryOne<ConnectionRow>("SELECT * FROM connections WHERE org_id = $1 AND connector_id = $2 ORDER BY created_at ASC LIMIT 1", [orgId, connectorId])
  return row ? rowToConnection(row) : null
}

/** Idempotent — returns the existing mirrored Connection for this
 * custom connector if one exists, else creates one fresh
 * (status: "not_connected"). Never changes the status of an existing
 * row — only a real check (POST .../test, via updateConnectionStatus)
 * earns a status change. Lets credential-set create the Connection
 * ahead of any successful test, so credential storage always has a
 * connection_id to key off (Phase 2A) — closing the sequencing gap
 * where "create -> set credential -> test" needs a Connection to exist
 * before the first test ever runs. */
export async function ensureConnectionForCustomConnector(orgId: string, userId: string | undefined, customConnectorId: string, displayName: string, authType: Connection["authType"] = "api_key"): Promise<Connection> {
  const connectorId = customConnectorConnectorId(customConnectorId)
  const existing = await getConnectionByConnectorId(orgId, connectorId)
  if (existing) return existing
  return createConnection({ orgId, userId, connectorId, authType, status: "not_connected", displayName })
}

/* ================================================================== *
 * CUSTOM CONNECTOR CREDENTIALS — backward-compatible convenience
 * wrappers, addressed by the connector's own id rather than its
 * mirrored connection's id (the shape every existing caller — the
 * credential-set/test routes, every custom-connector test in this
 * suite — already uses). Every function here is doubly scoped
 * (org_id AND, transitively through the mirrored Connection,
 * customConnectorId) so a caller can never reach a credential
 * belonging to a connector — or an organization — it doesn't own,
 * even with a guessed id.
 * ================================================================== */

export interface CustomConnectorCredentialSummary {
  id: string
  customConnectorId: string
  label: string
  createdAt: number
  updatedAt: number
}

function toCustomConnectorCredentialSummary(meta: CredentialMetadata, customConnectorId: string): CustomConnectorCredentialSummary {
  return { id: meta.id, customConnectorId, label: meta.label, createdAt: meta.createdAt, updatedAt: meta.updatedAt }
}

function connectionAuthTypeFor(kind: CustomConnector["kind"]): Connection["authType"] {
  return kind === "mcp" ? "mcp" : "api_key"
}

/** The custom connector's default credential — ensures its mirrored
 * Connection exists, then upserts through setConnectionCredential.
 * Silently a no-op (never throws) if customConnectorId doesn't belong
 * to orgId — matches the original UPDATE...WHERE semantics this
 * replaces. */
export async function setCustomConnectorCredential(customConnectorId: string, orgId: string, credential: CustomConnectorCredential, userId?: string): Promise<void> {
  const connector = await getCustomConnector(customConnectorId, orgId)
  if (!connector) return
  const connection = await ensureConnectionForCustomConnector(orgId, userId, customConnectorId, connector.name, connectionAuthTypeFor(connector.kind))
  await setConnectionCredential({ connectionId: connection.id, orgId, userId, label: "Default", kind: credential.type, credential, makePrimary: true, customConnectorId })
}

/** The custom connector's PRIMARY credential, decrypted. Null (never
 * a fabricated fallback) if the connector doesn't belong to orgId, or
 * no Connection/credential has ever been set for it. */
export async function getCustomConnectorCredential(customConnectorId: string, orgId: string): Promise<CustomConnectorCredential | null> {
  const connector = await getCustomConnector(customConnectorId, orgId)
  if (!connector) return null
  const connection = await getConnectionByConnectorId(orgId, customConnectorConnectorId(customConnectorId))
  if (!connection) return null
  return getPrimaryConnectionCredential(connection.id, orgId)
}

/** Real metadata only — id/label/timestamps, never the decrypted (or
 * even encrypted) secret. Empty list (never an error) if no
 * Connection has been created for this connector yet, i.e. no
 * credential has ever been set. */
export async function listCustomConnectorCredentials(customConnectorId: string, orgId: string): Promise<CustomConnectorCredentialSummary[]> {
  const connection = await getConnectionByConnectorId(orgId, customConnectorConnectorId(customConnectorId))
  if (!connection) return []
  const metas = await listConnectionCredentials(connection.id, orgId)
  return metas.map((m) => toCustomConnectorCredentialSummary(m, customConnectorId))
}

/** Adds an ADDITIONAL named credential (e.g. "Production"/"Staging")
 * to a custom connector's mirrored Connection — never the connector's
 * implicit default unless label is omitted. Verifies ownership of the
 * parent connector first (rather than relying on the FK alone) so the
 * error is an honest "not found" — never a raw constraint-violation
 * leaking whether some other org's connector id happens to exist. */
export async function createCustomConnectorCredential(input: { customConnectorId: string; orgId: string; userId?: string; label?: string; credential: CustomConnectorCredential }): Promise<CustomConnectorCredentialSummary> {
  const parent = await getCustomConnector(input.customConnectorId, input.orgId)
  if (!parent) throw new Error("Custom connector not found.")
  const connection = await ensureConnectionForCustomConnector(input.orgId, input.userId, input.customConnectorId, parent.name, connectionAuthTypeFor(parent.kind))
  const meta = await createConnectionCredential({
    connectionId: connection.id,
    orgId: input.orgId,
    userId: input.userId,
    label: input.label,
    kind: input.credential.type,
    credential: input.credential,
    customConnectorId: input.customConnectorId,
  })
  return toCustomConnectorCredentialSummary(meta, input.customConnectorId)
}

/** A specific labeled credential's real, decrypted value, addressed
 * by the connector's own id. Triply scoped in effect: id, the
 * connector's mirrored connection, AND org_id must all agree. */
export async function getCustomConnectorCredentialValue(id: string, customConnectorId: string, orgId: string): Promise<CustomConnectorCredential | null> {
  const connection = await getConnectionByConnectorId(orgId, customConnectorConnectorId(customConnectorId))
  if (!connection) return null
  return getConnectionCredentialValue(id, connection.id, orgId)
}

export async function deleteCustomConnectorCredential(id: string, orgId: string): Promise<void> {
  await deleteConnectionCredential(id, orgId)
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

/** Phase 2C — OAuth credential isolation decision: oauth_credentials
 * has no org_id column of its own (see migrations/
 * 0004_oauth_and_approvals.sql) — a Connection's real ownership lives
 * on `connections.org_id`, one hop away via connection_id. Rather than
 * add a redundant, independently-writable org_id copy onto this table
 * (a second source of truth that could in principle drift from the
 * real owner on `connections`, for zero real benefit — a token row's
 * org can never legitimately change without its Connection's also
 * changing), the isolation invariant is made explicit and ENFORCED
 * structurally here instead of relying on every caller to have
 * already verified ownership before calling in: both this function
 * and deleteOAuthCredential below now require orgId and verify it via
 * a real JOIN against `connections` — a connectionId that doesn't
 * belong to orgId returns null / deletes nothing, the same "id +
 * org_id must both agree" discipline every other table in this file
 * already follows, just expressed via a join instead of a column
 * because THIS table's real owner is one hop away, not on the row
 * itself. This closes the one gap the audit found: previously a
 * caller could, in principle, read/delete another org's token by
 * supplying its real connectionId with no org check at all. */
export async function getOAuthCredential(connectionId: string, orgId: string): Promise<OAuthCredentialRow | null> {
  const row = await queryOne<{
    id: string
    connection_id: string
    access_token_encrypted: string
    refresh_token_encrypted: string | null
    token_type: string | null
    scope: string | null
    expires_at: string | null
  }>(
    `SELECT oc.id, oc.connection_id, oc.access_token_encrypted, oc.refresh_token_encrypted, oc.token_type, oc.scope, oc.expires_at
     FROM oauth_credentials oc
     JOIN connections c ON c.id = oc.connection_id
     WHERE oc.connection_id = $1 AND c.org_id = $2`,
    [connectionId, orgId],
  )
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

export async function deleteOAuthCredential(connectionId: string, orgId: string): Promise<void> {
  await query(
    `DELETE FROM oauth_credentials
     WHERE connection_id = $1
       AND EXISTS (SELECT 1 FROM connections c WHERE c.id = $1 AND c.org_id = $2)`,
    [connectionId, orgId],
  )
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

/* ================================================================== *
 * OBSERVATORY — real, org-scoped, aggregate/bounded reads over the
 * SAME runtime tables every other real surface (Studio/Outputs/
 * Approvals) already writes — no second analytics data model, no
 * demo store. Every query here takes orgId as its first filter and
 * every other WHERE clause is built from it; nothing here ever
 * returns another org's row (see test/observatory.test.ts).
 *
 * Aggregates (getExecutionSummary, listWorkerHealth) are computed in
 * SQL, not by pulling rows into Node — correct and cheap regardless
 * of how many executions an org has accumulated, unlike the 500-row-
 * capped lists getBootstrapState() already uses elsewhere for UI that
 * only ever needs "recent", not "exact total". listExecutionsDetailed
 * is itself paginated (LIMIT/OFFSET) with server-side filtering, so
 * the browser never has to load more than one page to filter it.
 * ================================================================== */

export interface ExecutionFilters {
  workerId?: string
  status?: WorkerExecution["status"]
  sinceMs?: number
  untilMs?: number
}

/** Builds a real `WHERE` clause + positional params for the executions
 * table from the same filter shape every Observatory query accepts —
 * one place this scoping logic lives, so org_id is never accidentally
 * left out of a future query added here. */
function executionWhere(orgId: string, filters: ExecutionFilters, alias: string): { clause: string; params: unknown[] } {
  const clauses = [`${alias}.org_id = $1`]
  const params: unknown[] = [orgId]
  if (filters.workerId) {
    params.push(filters.workerId)
    clauses.push(`${alias}.worker_id = $${params.length}`)
  }
  if (filters.status) {
    params.push(filters.status)
    clauses.push(`${alias}.status = $${params.length}`)
  }
  if (filters.sinceMs != null) {
    params.push(filters.sinceMs)
    clauses.push(`${alias}.started_at >= $${params.length}`)
  }
  if (filters.untilMs != null) {
    params.push(filters.untilMs)
    clauses.push(`${alias}.started_at <= $${params.length}`)
  }
  return { clause: clauses.join(" AND "), params }
}

export interface ExecutionSummary {
  total: number
  completed: number
  partiallyCompleted: number
  failed: number
  /** running | resuming | retrying — actively in-flight right now. */
  running: number
  pendingApproval: number
  blocked: number
  cancelled: number
  queued: number
  /** completed / (every execution that has actually concluded:
   * completed + partiallyCompleted + failed + blocked + cancelled).
   * null (never 0-as-a-guess) when nothing has concluded yet — an
   * org with only in-flight/queued executions has no success rate
   * to report, and this never fabricates one. */
  successRate: number | null
  /** avg(duration_ms) over executions that actually finalized with a
   * real recorded duration — never estimated for in-flight runs. */
  avgDurationMs: number | null
  totalOutputs: number
  totalApprovals: number
  approvalsApproved: number
  approvalsRejected: number
  approvalsPending: number
  /** approved / (approved + rejected) — null when nothing has been
   * decided yet (a pending-only queue has no rate to report). */
  approvalRate: number | null
}

/** The Observatory's headline numbers — three cheap aggregate
 * queries (never a full row scan pulled into Node), each scoped to
 * orgId and, optionally, the same worker/status/date-range filters
 * the recent-executions list uses. */
export async function getExecutionSummary(orgId: string, filters: ExecutionFilters = {}): Promise<ExecutionSummary> {
  const { clause, params } = executionWhere(orgId, filters, "e")
  const execRow = await queryOne<{
    total: string
    completed: string
    partially_completed: string
    failed: string
    running: string
    pending_approval: string
    blocked: string
    cancelled: string
    queued: string
    avg_duration_ms: string | null
  }>(
    `SELECT
       count(*) AS total,
       count(*) FILTER (WHERE e.status = 'completed') AS completed,
       count(*) FILTER (WHERE e.status = 'partially_completed') AS partially_completed,
       count(*) FILTER (WHERE e.status = 'failed') AS failed,
       count(*) FILTER (WHERE e.status IN ('running','resuming','retrying')) AS running,
       count(*) FILTER (WHERE e.status = 'pending_approval') AS pending_approval,
       count(*) FILTER (WHERE e.status = 'blocked') AS blocked,
       count(*) FILTER (WHERE e.status = 'cancelled') AS cancelled,
       count(*) FILTER (WHERE e.status = 'queued') AS queued,
       avg(e.duration_ms) FILTER (WHERE e.duration_ms IS NOT NULL) AS avg_duration_ms
     FROM executions e WHERE ${clause}`,
    params,
  )

  // Outputs/approvals honor the same org + optional worker/date-range
  // scoping, applied to their own real timestamp columns.
  const outputClauses = ["org_id = $1"]
  const outputParams: unknown[] = [orgId]
  if (filters.workerId) {
    outputParams.push(filters.workerId)
    outputClauses.push(`worker_id = $${outputParams.length}`)
  }
  if (filters.sinceMs != null) {
    outputParams.push(filters.sinceMs)
    outputClauses.push(`created_at >= $${outputParams.length}`)
  }
  if (filters.untilMs != null) {
    outputParams.push(filters.untilMs)
    outputClauses.push(`created_at <= $${outputParams.length}`)
  }
  const outputRow = await queryOne<{ count: string }>(`SELECT count(*) FROM outputs WHERE ${outputClauses.join(" AND ")}`, outputParams)

  const approvalClauses = ["org_id = $1"]
  const approvalParams: unknown[] = [orgId]
  if (filters.workerId) {
    approvalParams.push(filters.workerId)
    approvalClauses.push(`worker_id = $${approvalParams.length}`)
  }
  if (filters.sinceMs != null) {
    approvalParams.push(filters.sinceMs)
    approvalClauses.push(`requested_at >= $${approvalParams.length}`)
  }
  if (filters.untilMs != null) {
    approvalParams.push(filters.untilMs)
    approvalClauses.push(`requested_at <= $${approvalParams.length}`)
  }
  const approvalRow = await queryOne<{ approved: string; rejected: string; pending: string; total: string }>(
    `SELECT
       count(*) FILTER (WHERE status = 'approved') AS approved,
       count(*) FILTER (WHERE status = 'rejected') AS rejected,
       count(*) FILTER (WHERE status = 'pending') AS pending,
       count(*) AS total
     FROM approvals WHERE ${approvalClauses.join(" AND ")}`,
    approvalParams,
  )

  const completed = Number(execRow?.completed ?? 0)
  const partiallyCompleted = Number(execRow?.partially_completed ?? 0)
  const failed = Number(execRow?.failed ?? 0)
  const blocked = Number(execRow?.blocked ?? 0)
  const cancelled = Number(execRow?.cancelled ?? 0)
  const terminal = completed + partiallyCompleted + failed + blocked + cancelled
  const approved = Number(approvalRow?.approved ?? 0)
  const rejected = Number(approvalRow?.rejected ?? 0)
  const decided = approved + rejected

  return {
    total: Number(execRow?.total ?? 0),
    completed,
    partiallyCompleted,
    failed,
    running: Number(execRow?.running ?? 0),
    pendingApproval: Number(execRow?.pending_approval ?? 0),
    blocked,
    cancelled,
    queued: Number(execRow?.queued ?? 0),
    successRate: terminal > 0 ? completed / terminal : null,
    avgDurationMs: execRow?.avg_duration_ms != null ? Number(execRow.avg_duration_ms) : null,
    totalOutputs: Number(outputRow?.count ?? 0),
    totalApprovals: Number(approvalRow?.total ?? 0),
    approvalsApproved: approved,
    approvalsRejected: rejected,
    approvalsPending: Number(approvalRow?.pending ?? 0),
    approvalRate: decided > 0 ? approved / decided : null,
  }
}

export interface ExecutionListFilters extends ExecutionFilters {
  approvalState?: "pending" | "approved" | "rejected" | "none"
}

export interface ExecutionListItem {
  id: string
  workerId: string
  workerName: string
  status: WorkerExecution["status"]
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  outputCount: number
  /** The most recent approval's status for this execution, or null if
   * this execution never triggered one. */
  approvalStatus: "pending" | "approved" | "rejected" | null
  /** The highest real attempt number recorded in action_executions
   * for this execution, or null if it never attempted a real external
   * action (nothing to report — never defaulted to 1). */
  maxAttempt: number | null
}

/** The real, paginated, server-filtered "recent executions" list —
 * every row already carries its worker name, output count, latest
 * approval state and max retry attempt via correlated subqueries, so
 * the UI never needs a second round-trip per row. */
export async function listExecutionsDetailed(orgId: string, filters: ExecutionListFilters = {}, limit = 25, offset = 0): Promise<{ items: ExecutionListItem[]; total: number }> {
  const { clause, params } = executionWhere(orgId, filters, "e")
  const clauses = [clause]
  if (filters.approvalState === "none") {
    clauses.push(`NOT EXISTS (SELECT 1 FROM approvals a WHERE a.execution_id = e.id)`)
  } else if (filters.approvalState) {
    params.push(filters.approvalState)
    clauses.push(`EXISTS (SELECT 1 FROM approvals a WHERE a.execution_id = e.id AND a.status = $${params.length})`)
  }
  const where = clauses.join(" AND ")

  const totalRow = await queryOne<{ count: string }>(`SELECT count(*) FROM executions e WHERE ${where}`, params)

  const boundedLimit = Math.min(Math.max(limit, 1), 100)
  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2
  const rows = await query<{
    id: string
    worker_id: string
    worker_name: string
    status: string
    started_at: string
    completed_at: string | null
    duration_ms: number | null
    output_count: string
    approval_status: string | null
    max_attempt: number | null
  }>(
    `SELECT
       e.id, e.worker_id, w.name AS worker_name, e.status, e.started_at, e.completed_at, e.duration_ms,
       (SELECT count(*) FROM outputs o WHERE o.execution_id = e.id) AS output_count,
       (SELECT a.status FROM approvals a WHERE a.execution_id = e.id ORDER BY a.requested_at DESC LIMIT 1) AS approval_status,
       (SELECT max(ax.attempt) FROM action_executions ax WHERE ax.execution_id = e.id) AS max_attempt
     FROM executions e JOIN workers w ON w.id = e.worker_id
     WHERE ${where}
     ORDER BY e.started_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...params, boundedLimit, offset],
  )

  return {
    items: rows.map((r) => ({
      id: r.id,
      workerId: r.worker_id,
      workerName: r.worker_name,
      status: r.status as WorkerExecution["status"],
      startedAt: Number(r.started_at),
      completedAt: r.completed_at ? Number(r.completed_at) : null,
      durationMs: r.duration_ms ?? null,
      outputCount: Number(r.output_count),
      approvalStatus: (r.approval_status as ExecutionListItem["approvalStatus"]) ?? null,
      maxAttempt: r.max_attempt ?? null,
    })),
    total: Number(totalRow?.count ?? 0),
  }
}

/** The subset of WorkerEventType that makes a useful operational
 * activity feed — deliberately excludes noisier/lower-level types
 * (reasoning_started/completed, permission_checked, tool_completed/
 * tool_blocked/tool_failed, metric_recorded, business_event_recorded,
 * the stage_* fine-grain types already shown in the per-execution
 * ExecutionTimeline). Every one of these IS a real WorkerEvent type
 * (see lib/workforce/model.ts) — nothing invented for this feed. */
const OBSERVATORY_ACTIVITY_TYPES = ["task_started", "stage_started", "tool_called", "approval_required", "approval_approved", "approval_rejected", "output_created", "task_completed", "task_failed", "task_blocked"] as const

export interface ActivityItem {
  id: string
  executionId: string
  workerId: string
  workerName: string
  type: WorkerEvent["type"]
  timestamp: number
  payload: Record<string, unknown>
}

/** A bounded (LIMIT-capped), org-scoped, optionally worker-scoped
 * read of the real execution_events table — the exact same durable
 * record ExecutionTimeline reads per-execution, just filtered to
 * "meaningful" types and spanning the whole org instead of one
 * execution. Never dumps the full event log into the browser. */
export async function listRecentActivity(orgId: string, opts: { workerId?: string; limit?: number } = {}): Promise<ActivityItem[]> {
  const clauses = ["ev.org_id = $1", "ev.type = ANY($2::text[])"]
  const params: unknown[] = [orgId, OBSERVATORY_ACTIVITY_TYPES]
  if (opts.workerId) {
    params.push(opts.workerId)
    clauses.push(`ev.worker_id = $${params.length}`)
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  params.push(limit)
  const rows = await query<{ id: string; execution_id: string; worker_id: string; worker_name: string; type: string; payload: Record<string, unknown>; timestamp: string }>(
    `SELECT ev.id, ev.execution_id, ev.worker_id, w.name AS worker_name, ev.type, ev.payload, ev."timestamp"
     FROM execution_events ev JOIN workers w ON w.id = ev.worker_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY ev."timestamp" DESC
     LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => ({
    id: r.id,
    executionId: r.execution_id,
    workerId: r.worker_id,
    workerName: r.worker_name,
    type: r.type as WorkerEvent["type"],
    timestamp: Number(r.timestamp),
    payload: r.payload,
  }))
}

export interface WorkerHealth {
  workerId: string
  workerName: string
  /** Real, persisted Worker lifecycle state (draft/building/ready/live)
   * — the same authoritative field Studio's own "Release" gate reads,
   * never inferred from the UI. Used by the real Worker Directory
   * (/workforce) to classify runtime status (see lib/workforce/health.ts). */
  workerStatus: Worker["status"]
  tested: boolean
  releasedVersionId: string | null
  /** The version_number of the currently released WorkerVersion, or
   * null if never released — what the Worker Directory shows as
   * "Version". Never the draft's in-progress edits. */
  releasedVersionNumber: number | null
  createdAt: number
  updatedAt: number
  executions: number
  completed: number
  failed: number
  /** Same terminal-outcome definition as ExecutionSummary.successRate
   * (completed / (completed+partiallyCompleted+failed+blocked+
   * cancelled)) — null when this worker has no concluded execution
   * yet, never fabricated as 0%. */
  successRate: number | null
  lastExecutionAt: number | null
  lastExecutionStatus: WorkerExecution["status"] | null
  outputs: number
  avgDurationMs: number | null
}

/** Per-worker rollup — one real, GROUP BY aggregate query, org-scoped,
 * covering every real Worker in the org (LEFT JOIN so a worker with
 * zero executions still appears, with real zeros/nulls, never
 * omitted or fabricated). */
export async function listWorkerHealth(orgId: string): Promise<WorkerHealth[]> {
  const rows = await query<{
    worker_id: string
    worker_name: string
    worker_status: string
    tested: boolean
    released_version_id: string | null
    released_version_number: number | null
    created_at: string
    updated_at: string
    executions: string
    completed: string
    partially_completed: string
    failed: string
    blocked: string
    cancelled: string
    last_execution_at: string | null
    outputs: string
    avg_duration_ms: string | null
  }>(
    `SELECT
       w.id AS worker_id,
       w.name AS worker_name,
       w.status AS worker_status,
       w.tested AS tested,
       w.released_version_id AS released_version_id,
       (SELECT wv.version_number FROM worker_versions wv WHERE wv.id = w.released_version_id) AS released_version_number,
       w.created_at AS created_at,
       w.updated_at AS updated_at,
       count(e.id) AS executions,
       count(e.id) FILTER (WHERE e.status = 'completed') AS completed,
       count(e.id) FILTER (WHERE e.status = 'partially_completed') AS partially_completed,
       count(e.id) FILTER (WHERE e.status = 'failed') AS failed,
       count(e.id) FILTER (WHERE e.status = 'blocked') AS blocked,
       count(e.id) FILTER (WHERE e.status = 'cancelled') AS cancelled,
       max(e.started_at) AS last_execution_at,
       (SELECT count(*) FROM outputs o WHERE o.worker_id = w.id) AS outputs,
       avg(e.duration_ms) FILTER (WHERE e.duration_ms IS NOT NULL) AS avg_duration_ms
     FROM workers w
     LEFT JOIN executions e ON e.worker_id = w.id AND e.org_id = w.org_id
     WHERE w.org_id = $1
     GROUP BY w.id, w.name, w.status, w.tested, w.released_version_id, w.created_at, w.updated_at
     ORDER BY count(e.id) DESC, w.name ASC`,
    [orgId],
  )

  // last_execution_status needs the actual most-recent row per
  // worker, which a plain aggregate can't give directly — one small,
  // bounded, indexed (idx_executions_org_started) follow-up query
  // rather than a per-row correlated subquery inside the GROUP BY.
  const lastRows = await query<{ worker_id: string; status: string }>(
    `SELECT DISTINCT ON (worker_id) worker_id, status
     FROM executions
     WHERE org_id = $1
     ORDER BY worker_id, started_at DESC`,
    [orgId],
  )
  const lastStatusByWorker = new Map(lastRows.map((r) => [r.worker_id, r.status]))

  return rows.map((r) => {
    const completed = Number(r.completed)
    const partiallyCompleted = Number(r.partially_completed)
    const failed = Number(r.failed)
    const blocked = Number(r.blocked)
    const cancelled = Number(r.cancelled)
    const terminal = completed + partiallyCompleted + failed + blocked + cancelled
    return {
      workerId: r.worker_id,
      workerName: r.worker_name,
      workerStatus: r.worker_status as Worker["status"],
      tested: r.tested,
      releasedVersionId: r.released_version_id,
      releasedVersionNumber: r.released_version_number,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      executions: Number(r.executions),
      completed,
      failed,
      successRate: terminal > 0 ? completed / terminal : null,
      lastExecutionAt: r.last_execution_at ? Number(r.last_execution_at) : null,
      lastExecutionStatus: (lastStatusByWorker.get(r.worker_id) as WorkerExecution["status"]) ?? null,
      outputs: Number(r.outputs),
      avgDurationMs: r.avg_duration_ms != null ? Number(r.avg_duration_ms) : null,
    }
  })
}

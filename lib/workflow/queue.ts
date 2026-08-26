import "server-only"

/* ================================================================== *
 * JOB QUEUE (§7-9) — real Postgres-backed queue: SELECT ... FOR UPDATE
 * SKIP LOCKED for safe concurrent dequeue (no external queue vendor —
 * ADR-017), tenant-aware concurrency limits so one tenant can never
 * starve another (§7/§9), priority-ordered (§8).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "@/lib/db/client"
import { countActiveRuns } from "./repo"
import { resolveConcurrencyLimit } from "./budget-policy"
import type { WorkflowPipeline, WorkflowPriority } from "./types"

export type JobStatus = "pending" | "locked" | "completed" | "failed" | "dead_letter" | "cancelled"

/** Default lease duration (§3, Phase 5A): how long a worker holds a
 * dequeued job before it's considered abandoned (crashed process, killed
 * container). Generous relative to a single step's real execution time —
 * a step is one bounded unit of work (one crawl batch, one LLM call),
 * never a whole pipeline. */
export const DEFAULT_LEASE_MS = 120_000

export interface Job {
  id: string
  orgId: string
  projectId: string | null
  workflowRunId: string | null
  /** Which single workflow step this job dispatches — null for a
   * (legacy/rare) whole-pipeline job. See ADR-023: this extends the
   * existing Job/jobs concept rather than introducing a parallel
   * WorkflowStepJob table. */
  stepName: string | null
  stepSequence: number | null
  type: WorkflowPipeline
  priority: WorkflowPriority
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  availableAt: number
  lockedAt: number | null
  lockedBy: string | null
  /** When the current lock expires — a locked job past this time is
   * treated as abandoned by reapExpiredLeases() (crash recovery). */
  leaseExpiresAt: number | null
  status: JobStatus
  idempotencyKey: string | null
  error: string | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

/** Per-(org, workflow type) concurrency ceiling — real, checked before
 * every dequeue admission (§9). Deliberately conservative defaults;
 * see tenant_budgets for a per-tenant override (lib/workflow/budget-policy.ts
 * reads it — kept out of this module to avoid a query-layer/DB-policy
 * circular dependency). */
export const DEFAULT_CONCURRENCY_LIMITS: Record<WorkflowPipeline, number> = {
  website_discovery: 3,
  content_generation: 5,
}

const PRIORITY_RANK: Record<WorkflowPriority, number> = { critical: 0, high: 1, normal: 2, low: 3, background: 4 }

interface JobRow {
  id: string
  org_id: string
  project_id: string | null
  workflow_run_id: string | null
  step_name: string | null
  step_sequence: number | null
  type: WorkflowPipeline
  priority: WorkflowPriority
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
  available_at: string
  locked_at: string | null
  locked_by: string | null
  lease_expires_at: string | null
  status: JobStatus
  idempotency_key: string | null
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    workflowRunId: r.workflow_run_id,
    stepName: r.step_name,
    stepSequence: r.step_sequence,
    type: r.type,
    priority: r.priority,
    payload: r.payload,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    availableAt: Number(r.available_at),
    lockedAt: r.locked_at ? Number(r.locked_at) : null,
    lockedBy: r.locked_by,
    leaseExpiresAt: r.lease_expires_at ? Number(r.lease_expires_at) : null,
    status: r.status,
    idempotencyKey: r.idempotency_key,
    error: r.error,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    completedAt: r.completed_at ? Number(r.completed_at) : null,
  }
}

export async function enqueue(input: {
  orgId: string
  projectId?: string
  workflowRunId?: string
  stepName?: string
  stepSequence?: number
  type: WorkflowPipeline
  priority?: WorkflowPriority
  payload: Record<string, unknown>
  maxAttempts?: number
  availableAt?: number
  idempotencyKey?: string
}): Promise<Job> {
  const id = `job_${randomUUID()}`
  const now = Date.now()
  try {
    await query(
      `INSERT INTO jobs (id, org_id, project_id, workflow_run_id, step_name, step_sequence, type, priority, payload, attempts, max_attempts, available_at, status, idempotency_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, 'pending', $12, $13, $13)`,
      [
        id,
        input.orgId,
        input.projectId ?? null,
        input.workflowRunId ?? null,
        input.stepName ?? null,
        input.stepSequence ?? null,
        input.type,
        input.priority ?? "normal",
        JSON.stringify(input.payload),
        input.maxAttempts ?? 3,
        input.availableAt ?? now,
        input.idempotencyKey ?? null,
        now,
      ],
    )
  } catch (err) {
    if ((err as { code?: string }).code === "23505" && input.idempotencyKey) {
      const existing = await queryOne<JobRow>("SELECT * FROM jobs WHERE idempotency_key = $1 AND status IN ('pending','locked')", [input.idempotencyKey])
      if (existing) return rowToJob(existing)
    }
    throw err
  }
  const created = await queryOne<JobRow>("SELECT * FROM jobs WHERE id = $1", [id])
  return rowToJob(created!)
}

/** Dequeues up to `limit` due jobs, priority-first, honoring per-tenant
 * concurrency limits (§9) — a tenant already at its limit is skipped
 * this tick, never starving other tenants and never exceeding its own
 * ceiling. Uses FOR UPDATE SKIP LOCKED so multiple concurrent worker
 * ticks (e.g. overlapping cron invocations) never double-dequeue the
 * same job. */
export async function dequeue(
  workerId: string,
  limit: number,
  concurrencyLimits: Partial<Record<WorkflowPipeline, number>> = {},
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<Job[]> {
  return withTransaction(async (client) => {
    const now = Date.now()
    const { rows } = await client.query<JobRow>(
      `SELECT * FROM jobs
       WHERE status = 'pending' AND available_at <= $1
       ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, available_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [now, Math.max(limit * 4, 20)], // over-fetch candidates so per-tenant limits still let us fill `limit` real admissions
    )

    const admitted: JobRow[] = []
    const admittedCountByKey = new Map<string, number>()
    const resolvedLimitByKey = new Map<string, number>() // cache within this tick — a tenant appearing in many candidate rows is looked up once
    for (const row of rows) {
      if (admitted.length >= limit) break
      const key = `${row.org_id}:${row.type}`
      let limitForType = resolvedLimitByKey.get(key)
      if (limitForType === undefined) {
        // real per-tenant override (§6, closes risks.md R-22) —
        // tenant_budgets -> DEFAULT_CONCURRENCY_LIMITS; an explicit
        // caller-supplied override (rare — used by tests) still wins.
        limitForType = concurrencyLimits[row.type] ?? (await resolveConcurrencyLimit(row.org_id, row.type, DEFAULT_CONCURRENCY_LIMITS[row.type]))
        resolvedLimitByKey.set(key, limitForType)
      }
      const alreadyActive = await countActiveRuns(row.org_id, row.type)
      const admittedThisTick = admittedCountByKey.get(key) ?? 0
      if (alreadyActive + admittedThisTick >= limitForType) continue // this tenant is at its concurrency ceiling — real backpressure, not an error
      admittedCountByKey.set(key, admittedThisTick + 1)
      admitted.push(row)
    }

    if (admitted.length === 0) return []
    const ids = admitted.map((r) => r.id)
    const leaseExpiresAt = now + leaseMs
    await client.query(
      `UPDATE jobs SET status = 'locked', locked_at = $1, locked_by = $2, lease_expires_at = $3, attempts = attempts + 1, updated_at = $1 WHERE id = ANY($4::text[])`,
      [now, workerId, leaseExpiresAt, ids],
    )
    return admitted.map((r) => rowToJob({ ...r, status: "locked", locked_at: String(now), locked_by: workerId, lease_expires_at: String(leaseExpiresAt), attempts: r.attempts + 1 }))
  })
}

export async function ack(jobId: string): Promise<void> {
  const now = Date.now()
  await query("UPDATE jobs SET status = 'completed', completed_at = $1, updated_at = $1 WHERE id = $2", [now, jobId])
}

/** Crash recovery (Phase 5A §4): a job whose lease has expired means the
 * worker that claimed it never finished — crashed process, killed
 * container, network partition. Never left `locked` forever: a job that
 * still has attempts left is returned to `pending` (the next tick picks
 * it up — real recovery, not data loss, because the step it dispatches
 * is itself checkpointed/idempotent, so re-running it is safe); a job
 * that has exhausted its attempts is dead-lettered instead, exactly like
 * any other exhausted-retry job, never silently dropped. Returns real
 * counts, run this from a worker tick (never required to run "instantly"
 * — a lease is a bounded window, not a hard deadline). */
export async function reapExpiredLeases(now: number = Date.now()): Promise<{ resetToPending: number; deadLettered: number }> {
  const deadLettered = await query<{ id: string }>(
    `UPDATE jobs SET status = 'dead_letter', error = 'Lease expired: attempts exhausted (worker likely crashed).', updated_at = $1
     WHERE status = 'locked' AND lease_expires_at IS NOT NULL AND lease_expires_at < $1 AND attempts >= max_attempts
     RETURNING id`,
    [now],
  )
  const resetToPending = await query<{ id: string }>(
    `UPDATE jobs SET status = 'pending', available_at = $1, locked_at = NULL, locked_by = NULL, lease_expires_at = NULL, updated_at = $1
     WHERE status = 'locked' AND lease_expires_at IS NOT NULL AND lease_expires_at < $1
     RETURNING id`,
    [now],
  )
  return { resetToPending: resetToPending.length, deadLettered: deadLettered.length }
}

/** Schedules a real retry — a fresh due time in the future, status
 * back to pending so the next tick picks it up. Exhausting max_attempts
 * routes to the dead letter instead (§7). */
export async function retryJob(jobId: string, delayMs: number): Promise<void> {
  const now = Date.now()
  await query("UPDATE jobs SET status = 'pending', available_at = $1, updated_at = $1 WHERE id = $2", [now + delayMs, jobId])
}

export async function deadLetter(jobId: string, reason: string): Promise<void> {
  await query("UPDATE jobs SET status = 'dead_letter', error = $1, updated_at = $2 WHERE id = $3", [reason, Date.now(), jobId])
}

export async function cancelJob(jobId: string, orgId: string): Promise<void> {
  await query("UPDATE jobs SET status = 'cancelled', updated_at = $1 WHERE id = $2 AND org_id = $3 AND status IN ('pending','locked')", [Date.now(), jobId, orgId])
}

export async function listDeadLetterJobs(orgId: string): Promise<Job[]> {
  const rows = await query<JobRow>("SELECT * FROM jobs WHERE org_id = $1 AND status = 'dead_letter' ORDER BY updated_at DESC", [orgId])
  return rows.map(rowToJob)
}

export async function queueDepth(): Promise<{ pending: number; locked: number; deadLetter: number }> {
  const row = await queryOne<{ pending: string; locked: string; dead_letter: string }>(
    `SELECT
       count(*) FILTER (WHERE status = 'pending') AS pending,
       count(*) FILTER (WHERE status = 'locked') AS locked,
       count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter
     FROM jobs`,
  )
  return { pending: Number(row?.pending ?? 0), locked: Number(row?.locked ?? 0), deadLetter: Number(row?.dead_letter ?? 0) }
}

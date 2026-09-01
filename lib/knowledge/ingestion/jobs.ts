import "server-only"

/* ================================================================== *
 * JOB QUEUE
 *
 * Milestone 1 adds ZERO dependencies, so `knowledge_jobs` is the
 * queue. The transport is temporary — pg-boss replaces it in a later
 * milestone without the stage functions changing — but the SEMANTICS
 * are production-quality and are built correctly now:
 *
 *   · compare-and-swap claiming (FOR UPDATE SKIP LOCKED), so two
 *     concurrent runners can never process the same job
 *   · attempt counter with a hard ceiling
 *   · exponential backoff with jitter via run_after
 *   · a reaper that reclaims jobs whose runner died mid-flight
 *   · idempotency: one live job per (object, kind)
 *   · explicit terminal failure, never an unbounded retry loop
 *
 * This is deliberately NOT a fake async system: work happens outside
 * the request that created it, survives the client disconnecting, and
 * is recovered by the reaper if the process dies.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/platform/db"
import { backoffMs, MAX_ATTEMPTS, shouldRetry } from "./state.ts"

/** A job claimed for longer than this is presumed dead and reclaimed.
 * Comfortably above the 30s total fetch timeout. */
export const STALE_LOCK_MS = 5 * 60 * 1000

/**
 * What a job asks for. M2 adds exactly the kind it needs and no
 * speculative ones.
 *
 *   ingest     fetch, archive, extract, persist — the M1 pipeline
 *   reextract  re-run extraction over an ARCHIVED artifact. No fetch,
 *              so it is not rate-limited by a publisher and cannot
 *              fail because a page has since moved or gone paywalled.
 */
export type JobKind = "ingest" | "reextract"

export interface ClaimedJob {
  id: string
  workspaceId: string
  objectId: string
  kind: JobKind
  attempt: number
  maxAttempts: number
}

interface JobRow {
  id: string
  org_id: string
  object_id: string
  kind: string
  attempt: number
  max_attempts: number
}

/** Identifies the runner that holds a lock. Useful in logs when
 * diagnosing which instance died. */
export function newRunnerId(): string {
  return `runner_${randomUUID().slice(0, 8)}`
}

/**
 * Atomically claim one due job.
 *
 * The inner SELECT ... FOR UPDATE SKIP LOCKED plus the `status =
 * 'pending'` predicate in the UPDATE is the compare-and-swap: two
 * runners racing on the same row produce exactly one winner, and the
 * loser silently gets the next row (or nothing) instead of blocking.
 */
export async function claimNextJob(runnerId: string, now = Date.now()): Promise<ClaimedJob | null> {
  const row = await queryOne<JobRow>(
    `UPDATE knowledge_jobs
     SET status = 'active', locked_at = $1, locked_by = $2, attempt = attempt + 1, updated_at = $1
     WHERE id = (
       SELECT id FROM knowledge_jobs
       WHERE status = 'pending' AND run_after <= $1
       ORDER BY run_after ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, org_id, object_id, kind, attempt, max_attempts`,
    [now, runnerId],
  )
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.org_id,
    objectId: row.object_id,
    kind: row.kind as JobKind,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
  }
}

/**
 * Enqueue (or re-arm) one job for an object.
 *
 * ONE LIVE JOB PER (object, kind), enforced by the idempotency key: a
 * user hammering "re-extract" produces one unit of work, not twenty.
 * An existing row is RE-ARMED rather than duplicated — status back to
 * pending, attempt counter back to zero — because a re-extraction
 * asked for today deserves its own full allowance of attempts, not
 * whatever a run last month left over.
 *
 * Tenant-scoped like everything else: the insert's guard proves the
 * object belongs to this workspace, with no window between check and
 * write.
 */
export async function enqueueJob(
  scope: { workspaceId: string },
  objectId: string,
  kind: JobKind,
  now = Date.now(),
): Promise<{ jobId: string; created: boolean } | null> {
  const key = `${kind}:${objectId}`
  const jobId = `kjob_${randomUUID()}`

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO knowledge_jobs
       (id, org_id, object_id, kind, status, attempt, run_after, idempotency_key, created_at, updated_at)
     SELECT $1, $2, $3, $4, 'pending', 0, $5, $6, $5, $5
     WHERE EXISTS (
       SELECT 1 FROM knowledge_objects WHERE id = $3 AND org_id = $2 AND deleted_at IS NULL
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [jobId, scope.workspaceId, objectId, kind, now, key],
  )
  if (inserted) return { jobId: inserted.id, created: true }

  const rearmed = await queryOne<{ id: string }>(
    `UPDATE knowledge_jobs
     SET status = 'pending', attempt = 0, run_after = $1, locked_at = NULL, locked_by = NULL,
         last_error_code = NULL, last_error = NULL, updated_at = $1
     WHERE idempotency_key = $2 AND org_id = $3 AND status <> 'active'
     RETURNING id`,
    [now, key, scope.workspaceId],
  )
  if (rearmed) return { jobId: rearmed.id, created: false }

  // Either the object is not this workspace's, or a runner is holding
  // the job right now. Both mean "no new work"; neither is an error.
  return null
}

export async function completeJob(jobId: string, now = Date.now()): Promise<void> {
  await query(
    `UPDATE knowledge_jobs
     SET status = 'completed', locked_at = NULL, locked_by = NULL, updated_at = $1
     WHERE id = $2 AND status = 'active'`,
    [now, jobId],
  )
}

/**
 * Record a failed attempt.
 *
 * Retryable and under the ceiling → back to `pending` with backoff.
 * Otherwise → terminal `failed`. Returns which happened so the caller
 * can set the object's status to match.
 */
export async function failJob(
  job: ClaimedJob,
  failureCode: string,
  message: string,
  now = Date.now(),
): Promise<{ willRetry: boolean; runAfter: number | null }> {
  const willRetry = shouldRetry(failureCode, job.attempt, job.maxAttempts)

  if (willRetry) {
    const runAfter = now + backoffMs(job.attempt)
    await query(
      `UPDATE knowledge_jobs
       SET status = 'pending', run_after = $1, locked_at = NULL, locked_by = NULL,
           last_error_code = $2, last_error = $3, updated_at = $4
       WHERE id = $5`,
      [runAfter, failureCode, message.slice(0, 500), now, job.id],
    )
    return { willRetry: true, runAfter }
  }

  await query(
    `UPDATE knowledge_jobs
     SET status = 'failed', locked_at = NULL, locked_by = NULL,
         last_error_code = $1, last_error = $2, updated_at = $3
     WHERE id = $4`,
    [failureCode, message.slice(0, 500), now, job.id],
  )
  return { willRetry: false, runAfter: null }
}

/**
 * THE REAPER.
 *
 * Every other mechanism assumes the runner survives. This one does
 * not: a job claimed but never finished (process killed mid-fetch, a
 * deploy, an OOM) is reclaimed here. Without it, a single dead runner
 * strands an object in `fetching` forever with no error and no alert.
 *
 * Reclaimed jobs keep their attempt count, so a job that repeatedly
 * kills its runner still terminates rather than looping.
 */
export async function reapStaleJobs(now = Date.now()): Promise<{ requeued: number; failed: number }> {
  const cutoff = now - STALE_LOCK_MS

  // Still has attempts left → back to pending, available immediately.
  const requeued = await query<{ id: string; object_id: string }>(
    `UPDATE knowledge_jobs
     SET status = 'pending', run_after = $1, locked_at = NULL, locked_by = NULL,
         last_error_code = 'runner_lost', last_error = 'The runner stopped before finishing.', updated_at = $1
     WHERE status = 'active' AND locked_at < $2 AND attempt < max_attempts
     RETURNING id, object_id`,
    [now, cutoff],
  )

  // Out of attempts → terminal failure, and the object must say so.
  const failed = await query<{ id: string; object_id: string; org_id: string }>(
    `UPDATE knowledge_jobs
     SET status = 'failed', locked_at = NULL, locked_by = NULL,
         last_error_code = 'runner_lost', last_error = 'The runner stopped before finishing.', updated_at = $1
     WHERE status = 'active' AND locked_at < $2 AND attempt >= max_attempts
     RETURNING id, object_id, org_id`,
    [now, cutoff],
  )

  if (requeued.length > 0) {
    await query(
      `UPDATE knowledge_objects SET status = 'pending', updated_at = $1
       WHERE id = ANY($2::text[]) AND status IN ('fetching', 'extracting')`,
      [now, requeued.map((r) => r.object_id)],
    )
  }
  if (failed.length > 0) {
    await query(
      `UPDATE knowledge_objects
       SET status = 'failed', failure_code = 'runner_lost',
           failure_message = 'Processing stopped unexpectedly. Try again.', updated_at = $1
       WHERE id = ANY($2::text[]) AND status <> 'completed'`,
      [now, failed.map((r) => r.object_id)],
    )
  }

  return { requeued: requeued.length, failed: failed.length }
}

export { MAX_ATTEMPTS }

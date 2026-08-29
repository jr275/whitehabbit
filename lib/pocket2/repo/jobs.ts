import "server-only"

/* ================================================================== *
 * INGESTION JOB QUEUE — Postgres as the queue.
 *
 * Chosen over adding a broker because the database is already the
 * consistency boundary, and `FOR UPDATE SKIP LOCKED` is a correct,
 * well-understood claim primitive: two serverless instances ticking
 * simultaneously cannot pick up the same job, and a crashed worker's
 * lease simply expires instead of losing the work.
 *
 * The shape here (claim -> run -> complete|retry) is what makes moving
 * to a real broker later a change of transport, not of design.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export type JobKind = "metadata" | "extract" | "tts" | "reindex"

export interface IngestJob {
  id: string
  itemId: string | null
  orgId: string
  kind: JobKind
  attempts: number
  maxAttempts: number
  payload: Record<string, unknown>
}

/** How long a claimed job stays claimed. Long enough for the slowest
 * legitimate fetch (20s) plus extraction, short enough that a worker
 * killed mid-flight does not strand the job for minutes. */
const LEASE_MS = 60_000

/** Exponential with a ceiling. A publisher that is down for an hour
 * should not be retried every ten seconds for an hour. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000)
}

/**
 * Atomically claim up to `limit` runnable jobs.
 *
 * SKIP LOCKED is the whole point: concurrent ticks step over rows
 * another transaction already holds instead of blocking on them, so
 * throughput scales with instances rather than serializing.
 */
export async function claimJobs(limit: number, workerId: string): Promise<IngestJob[]> {
  const now = Date.now()
  const rows = await query<{
    id: string; item_id: string | null; org_id: string; kind: string
    attempts: number; max_attempts: number; payload: Record<string, unknown>
  }>(
    `UPDATE ingest_jobs SET
       status = 'processing',
       attempts = attempts + 1,
       locked_by = $1,
       locked_until = $2,
       updated_at = $3
     WHERE id IN (
       SELECT id FROM ingest_jobs
        WHERE next_attempt_at <= $3
          -- FINDING QUEUE-01: without this the reclaim branch below is
          -- unbounded. A job whose worker dies BEFORE it can report a
          -- failure never reaches failJob(), so its status stays
          -- 'processing' and it was handed out again on every tick
          -- forever — a page that reliably crashes the worker became a
          -- permanent drain on a queue slot. Confirmed at 12 claims
          -- against max_attempts = 4 before this guard.
          AND attempts < max_attempts
          AND (status = 'queued'
               -- reclaim a job whose worker died mid-flight
               OR (status = 'processing' AND locked_until < $3))
        ORDER BY next_attempt_at ASC
        LIMIT $4
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, item_id, org_id, kind, attempts, max_attempts, payload`,
    [workerId, now + LEASE_MS, now, limit],
  )

  return rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    orgId: r.org_id,
    kind: r.kind as JobKind,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    payload: r.payload ?? {},
  }))
}

export async function completeJob(jobId: string): Promise<void> {
  await query(
    "UPDATE ingest_jobs SET status = 'done', locked_by = NULL, locked_until = NULL, last_error = NULL, updated_at = $2 WHERE id = $1",
    [jobId, Date.now()],
  )
}

/**
 * Record a failure and decide whether to retry.
 *
 * `retryable: false` is for outcomes that will never change no matter
 * how many times we ask — a blocked address, an unsupported content
 * type, a robots disallow. Retrying those wastes the queue and, worse,
 * repeatedly bothers someone else's server.
 */
export async function failJob(
  jobId: string,
  error: string,
  opts: { retryable: boolean; attempts: number; maxAttempts: number },
): Promise<{ willRetry: boolean }> {
  const willRetry = opts.retryable && opts.attempts < opts.maxAttempts
  const now = Date.now()
  await query(
    `UPDATE ingest_jobs SET
       status = $2, locked_by = NULL, locked_until = NULL,
       last_error = $3, next_attempt_at = $4, updated_at = $5
     WHERE id = $1`,
    [jobId, willRetry ? "queued" : "failed", error.slice(0, 1000),
     willRetry ? now + backoffMs(opts.attempts) : now, now],
  )
  return { willRetry }
}

/** Enqueue work. Used by saveItem (metadata) and by an explicit
 * user-initiated retry. */
export async function enqueueJob(
  orgId: string,
  kind: JobKind,
  itemId: string | null,
  payload: Record<string, unknown> = {},
  runAt = Date.now(),
): Promise<string> {
  const id = `job_${randomUUID()}`
  await query(
    `INSERT INTO ingest_jobs (id, item_id, org_id, kind, status, next_attempt_at, payload, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'queued',$5,$6::jsonb,$7,$7)`,
    [id, itemId, orgId, kind, runAt, JSON.stringify(payload), Date.now()],
  )
  return id
}

/**
 * Mark abandoned jobs as failed.
 *
 * The claim guard stops a crash-looping job being retried forever, but
 * on its own it would leave that job sitting in 'processing'
 * indefinitely — invisible rather than merely unproductive. This gives
 * such a job a terminal state and a real reason, so it shows up as a
 * failure the user can retry deliberately rather than as a job that
 * quietly stopped existing.
 */
export async function reapAbandonedJobs(): Promise<number> {
  const now = Date.now()
  const rows = await query<{ id: string }>(
    `UPDATE ingest_jobs SET
       status = 'failed',
       locked_by = NULL,
       locked_until = NULL,
       last_error = coalesce(last_error, 'Processing was interrupted repeatedly and did not complete.'),
       updated_at = $1
     WHERE status = 'processing'
       AND locked_until < $1
       AND attempts >= max_attempts
     RETURNING id`,
    [now],
  )
  return rows.length
}

export async function queueDepth(): Promise<{ queued: number; processing: number; failed: number }> {
  const row = await queryOne<{ queued: string; processing: string; failed: string }>(
    `SELECT count(*) FILTER (WHERE status = 'queued')     AS queued,
            count(*) FILTER (WHERE status = 'processing') AS processing,
            count(*) FILTER (WHERE status = 'failed')     AS failed
       FROM ingest_jobs`,
  )
  return {
    queued: Number(row?.queued ?? 0),
    processing: Number(row?.processing ?? 0),
    failed: Number(row?.failed ?? 0),
  }
}

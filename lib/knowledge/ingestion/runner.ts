import "server-only"

/* ================================================================== *
 * RUNNER — drains the knowledge queue.
 *
 * Milestone 1 has no worker process and no queue dependency, so the
 * runner is driven from two places:
 *
 *   1. after() on the save request — Next.js keeps the work alive
 *      after the response is sent, so extraction genuinely happens
 *      outside the request the user waited on, and survives the
 *      browser disconnecting.
 *   2. POST /api/knowledge/tick — an authenticated internal endpoint
 *      for a scheduler to hit, which is what recovers retries whose
 *      backoff has elapsed and jobs whose runner died.
 *
 * This is deliberately not a fake async system. The work is durable,
 * claimed under compare-and-swap, retried with backoff, and reaped
 * when a runner dies. What is temporary is the TRANSPORT, not the
 * semantics: swapping in pg-boss and a worker container later means
 * replacing this file, not the pipeline.
 * ================================================================== */

import { logger } from "@/lib/platform/logger"
import { workerScope } from "../access/worker.ts"
import { collectReleasedArtifacts } from "../archive/index.ts"
import { claimNextJob, completeJob, failJob, newRunnerId, reapStaleJobs, type ClaimedJob } from "./jobs.ts"
import { runIngestJob } from "./pipeline.ts"
import { reextractObject } from "./reextract.ts"

/** Bounded so a single invocation cannot run past a function timeout. */
const DEFAULT_MAX_JOBS = 5
const DEFAULT_BUDGET_MS = 45_000

export interface DrainResult {
  claimed: number
  completed: number
  failed: number
  retrying: number
  skipped: number
  reaped: { requeued: number; failed: number }
  collected: number
}

/**
 * Run one claimed job, whatever kind it is.
 *
 * The dispatch lives here rather than inside either stage, so adding
 * a kind is a case in one switch and neither pipeline learns about
 * the other. Both stages return typed outcomes instead of throwing,
 * for the same reason: an unhandled throw leaves a job 'active' until
 * the reaper notices.
 */
async function runJob(job: ClaimedJob): Promise<"completed" | "failed" | "retrying" | "skipped"> {
  if (job.kind === "ingest") {
    const outcome = await runIngestJob(job)
    return outcome.status === "completed"
      ? "completed"
      : outcome.status === "failed"
        ? "failed"
        : outcome.status === "retrying"
          ? "retrying"
          : "skipped"
  }

  // reextract: no fetch, so no backoff-worthy transient failures. It
  // either produced something better, declined to, or could not read
  // the archive — and in every case the stored article is intact.
  const outcome = await reextractObject(workerScope(job.workspaceId), job.objectId)
  if (outcome.status === "failed") {
    await failJob(job, outcome.failureCode ?? "reextract_error", "Re-extraction could not complete.")
    return "failed"
  }
  await completeJob(job.id)
  return outcome.status === "replaced" ? "completed" : "skipped"
}

/**
 * Claim and run due jobs until the budget is spent or the queue is
 * empty. Safe to call concurrently: claiming is a compare-and-swap, so
 * two overlapping runners split the work rather than duplicating it.
 */
export async function drainQueue(
  options: { maxJobs?: number; budgetMs?: number; reap?: boolean; collect?: boolean } = {},
): Promise<DrainResult> {
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS
  const deadline = Date.now() + budgetMs
  const runnerId = newRunnerId()

  const result: DrainResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    skipped: 0,
    reaped: { requeued: 0, failed: 0 },
    collected: 0,
  }

  // Reap first: a job stranded by a dead runner should become
  // claimable in this same pass rather than waiting for the next one.
  if (options.reap !== false) {
    result.reaped = await reapStaleJobs()
  }

  for (let i = 0; i < maxJobs; i++) {
    if (Date.now() >= deadline) break

    const job = await claimNextJob(runnerId)
    if (!job) break
    result.claimed++

    try {
      const status = await runJob(job)
      if (status === "completed") result.completed++
      else if (status === "failed") result.failed++
      else if (status === "retrying") result.retrying++
      else result.skipped++
    } catch (err) {
      // Both stages are written not to throw; this is belt and braces
      // so one bad job can never abort the whole drain.
      logger.error("knowledge_runner_unhandled", {
        jobId: job.id,
        objectId: job.objectId,
        kind: job.kind,
        message: err instanceof Error ? err.message : String(err),
      })
      result.failed++
    }
  }

  // Garbage collection rides on the same pass that reaps, and only
  // ever touches artifacts retention already released. Last, so it
  // can never delay real work.
  if (options.collect !== false && Date.now() < deadline) {
    result.collected = (await collectReleasedArtifacts()).collected
  }

  return result
}

/**
 * Fire-and-forget drain for the save path. Never rejects — a failure
 * here must not surface on the user's save response, and the job is
 * already durable, so the reaper or the next tick will pick it up.
 */
export function drainInBackground(): Promise<void> {
  // No collection sweep on the save path: the user is waiting on the
  // response, and garbage is the tick's problem, not theirs.
  return drainQueue({ maxJobs: 3, budgetMs: 30_000, collect: false })
    .then((r) => {
      logger.info("knowledge_drain", { ...r, reaped: undefined, ...r.reaped })
    })
    .catch((err) => {
      logger.error("knowledge_drain_failed", { message: err instanceof Error ? err.message : String(err) })
    })
}

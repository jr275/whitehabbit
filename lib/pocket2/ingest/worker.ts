import "server-only"

/* ================================================================== *
 * WORKER TICK — claims a batch of jobs and runs them.
 *
 * Deliberately a plain async function rather than a long-running
 * process: this deployment is serverless, where nothing runs between
 * requests. A tick is short, idempotent and safe to invoke
 * concurrently (claimJobs uses FOR UPDATE SKIP LOCKED), so it can be
 * driven by cron, by a request, or by a real queue later without the
 * pipeline changing at all.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { queryOne } from "@/lib/db/client"
import { logger, newRequestId } from "@/lib/observability/logger"
import { claimJobs, completeJob, failJob, reapAbandonedJobs, type IngestJob } from "@/lib/pocket2/repo/jobs"
import { pruneExpiredRateLimits } from "@/lib/db/repo"
import { runMetadataIngest, type PageFetcher, type RobotsChecker } from "./pipeline"

/** Small batches keep a tick well inside a serverless request budget;
 * throughput comes from ticking often and concurrently, not from one
 * long tick. */
export const DEFAULT_BATCH = 5

export interface TickResult {
  claimed: number
  succeeded: number
  failed: number
  retrying: number
  durationMs: number
}

export interface TickOptions {
  /** Injected only by tests and by a future alternative fetcher;
   * production passes nothing and gets the guarded HTTP path. */
  fetcher?: PageFetcher
  robotsChecker?: RobotsChecker
}

async function runOne(job: IngestJob, requestId: string, options: TickOptions): Promise<"ok" | "retry" | "failed"> {
  if (!job.itemId) {
    await failJob(job.id, "Job has no item.", { retryable: false, attempts: job.attempts, maxAttempts: job.maxAttempts })
    return "failed"
  }

  // Read the item inside its own org — the job row carries org_id, and
  // this query filters on it, so a corrupted job cannot make the
  // worker fetch another tenant's item.
  const item = await queryOne<{ url: string; canonical_url: string; domain: string }>(
    "SELECT url, canonical_url, domain FROM saved_items WHERE id = $1 AND org_id = $2",
    [job.itemId, job.orgId],
  )
  if (!item) {
    // Deleted between enqueue and claim. Not an error worth retrying.
    await completeJob(job.id)
    return "ok"
  }

  const lastAttempt = job.attempts >= job.maxAttempts

  try {
    const outcome = await runMetadataIngest({
      orgId: job.orgId,
      itemId: job.itemId,
      url: item.canonical_url,
      domain: item.domain,
      lastAttempt,
      requestId,
      fetcher: options.fetcher,
      robotsChecker: options.robotsChecker,
    })

    if (outcome.status === "ready") {
      await completeJob(job.id)
      return "ok"
    }

    const { willRetry } = await failJob(job.id, outcome.reason ?? "ingest_failed", {
      retryable: outcome.retryable,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    })
    return willRetry ? "retry" : "failed"
  } catch (error) {
    // An unexpected throw is a bug, not an expected outcome — it is
    // logged loudly and retried, because the next attempt may well
    // land on a different instance or a fixed deploy.
    const message = error instanceof Error ? error.message : String(error)
    logger.error("pocket2_ingest_unhandled", { requestId, jobId: job.id, itemId: job.itemId, message })
    const { willRetry } = await failJob(job.id, message, {
      retryable: true, attempts: job.attempts, maxAttempts: job.maxAttempts,
    })
    return willRetry ? "retry" : "failed"
  }
}

export async function runIngestTick(batch = DEFAULT_BATCH, options: TickOptions = {}): Promise<TickResult> {
  const requestId = newRequestId()
  const workerId = `w_${randomUUID().slice(0, 8)}`
  const started = Date.now()

  // Give a terminal state to anything a crashed worker abandoned,
  // before claiming new work. Cheap: it touches only rows whose lease
  // has already expired.
  await reapAbandonedJobs().catch(() => 0)

  const jobs = await claimJobs(batch, workerId)
  if (jobs.length === 0) {
    // Piggyback the rate-limit table's cleanup on the tick. The
    // function existed but nothing ever called it, so
    // rate_limit_counters grew without bound (audit item #9).
    await pruneExpiredRateLimits().catch(() => {})
    return { claimed: 0, succeeded: 0, failed: 0, retrying: 0, durationMs: Date.now() - started }
  }

  // Jobs in a batch are independent and each is dominated by network
  // wait, so they run concurrently rather than one after another.
  const outcomes = await Promise.all(jobs.map((job) => runOne(job, requestId, options)))

  const result: TickResult = {
    claimed: jobs.length,
    succeeded: outcomes.filter((o) => o === "ok").length,
    failed: outcomes.filter((o) => o === "failed").length,
    retrying: outcomes.filter((o) => o === "retry").length,
    durationMs: Date.now() - started,
  }
  logger.info("pocket2_ingest_tick", { requestId, ...result })
  return result
}

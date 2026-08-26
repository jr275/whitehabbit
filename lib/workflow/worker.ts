import "server-only"

/* ================================================================== *
 * QUEUE WORKER (§7, ADR-017) — the "worker tick" that drains due jobs.
 * No persistent worker process exists in this deployment (a single
 * Next.js app on Vercel, per ADR-000/003) — this function is designed
 * to be invoked by a scheduler (Vercel Cron hits POST /api/v1/workflows/
 * process — see vercel.json) or manually/in tests. Each tick is a real,
 * complete unit of work: dequeue, execute, ack/retry/dead-letter — never
 * a fake "processed" response with nothing actually run.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { runWebsiteDiscovery } from "@/lib/website-discovery/orchestrator"
import { getWebsite } from "@/lib/websites/repo"
import { runContentGeneration } from "@/lib/content-pipeline/orchestrator"
import { getOpportunity } from "@/lib/opportunity/repo"
import { buildPageBriefFromOpportunity } from "@/lib/pagebrief/build"
import { getPageBriefByOpportunity } from "@/lib/pagebrief/repo"
import { ack, dequeue, deadLetter, retryJob, type Job } from "./queue"
import { isRetryableError, computeBackoffMs } from "./retry"

export interface WorkerTickResult {
  workerId: string
  dequeued: number
  succeeded: number
  retried: number
  deadLettered: number
  errors: { jobId: string; error: string }[]
}

async function executeJob(job: Job): Promise<void> {
  if (job.type === "website_discovery") {
    const websiteId = job.payload.websiteId as string
    const website = await getWebsite(websiteId, job.orgId)
    if (!website) throw new Error(`Website ${websiteId} not found for org ${job.orgId}.`)
    await runWebsiteDiscovery(website)
    return
  }
  if (job.type === "content_generation") {
    const opportunityId = job.payload.opportunityId as string
    const opportunity = await getOpportunity(opportunityId, job.orgId)
    if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found for org ${job.orgId}.`)
    const brief = (await getPageBriefByOpportunity(opportunity.id, job.orgId)) ?? (await buildPageBriefFromOpportunity(opportunity))
    await runContentGeneration(opportunity, brief)
    return
  }
  throw new Error(`Unknown job type: ${job.type}`)
}

/** Drains up to `maxJobs` due jobs across all tenants, respecting each
 * tenant's concurrency ceiling (lib/workflow/queue.ts's dequeue()).
 * A job whose error is retryable and hasn't exhausted max_attempts is
 * rescheduled with real backoff; otherwise it's dead-lettered (§7) —
 * never silently dropped. */
export async function processQueue(maxJobs = 10): Promise<WorkerTickResult> {
  const workerId = `worker_${randomUUID()}`
  const jobs = await dequeue(workerId, maxJobs)
  const result: WorkerTickResult = { workerId, dequeued: jobs.length, succeeded: 0, retried: 0, deadLettered: 0, errors: [] }

  for (const job of jobs) {
    try {
      await executeJob(job)
      await ack(job.id)
      result.succeeded += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ jobId: job.id, error: message })
      if (isRetryableError(err) && job.attempts < job.maxAttempts) {
        await retryJob(job.id, computeBackoffMs(job.attempts))
        result.retried += 1
      } else {
        await deadLetter(job.id, message)
        result.deadLettered += 1
      }
    }
  }
  return result
}

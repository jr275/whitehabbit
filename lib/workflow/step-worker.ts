import "server-only"

/* ================================================================== *
 * STEP-LEVEL WORKER (Phase 5A, ADR-023) — the real queue-driven
 * execution path. The HTTP request that starts/resumes/retries a
 * workflow, or an approval decision that unblocks one, only ever
 * enqueues ONE step job and returns; this module is what actually
 * executes a step, persists its result, and enqueues the next one.
 *
 *   dequeue job -> validate tenant/capability/state -> execute exactly
 *   one step -> persist output (inside dispatch, via runStep) -> update
 *   checkpoint (inside runStep) -> enqueue next step -> ack job
 *
 * If the process dies between any two of these, the step itself is
 * either fully committed (already persisted, checkpoint-resume skips
 * it) or not committed at all (the job's lease expires and
 * reapExpiredLeases() returns it to pending — a fresh dequeue re-runs
 * the exact same step, safely, because every step is idempotent by
 * construction: runStep() itself for checkpointed steps, and
 * content-pipeline's own approval/publish idempotency for
 * "decide_publish"). Never a half-applied step.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { getWorkflowRun } from "./repo"
import type { Job } from "./queue"
import { ack, dequeue, deadLetter, enqueue, reapExpiredLeases, retryJob } from "./queue"
import { buildStepJobIdempotencyKey } from "./idempotency"
import { isRetryableError, computeBackoffMs } from "./retry"
import { finalizeWorkflow } from "./engine"
import type { WorkflowRun } from "./types"
import { dispatchWebsiteDiscoveryStep, websiteDiscoveryStepSequence } from "@/lib/website-discovery/steps"
import { getWebsite } from "@/lib/websites/repo"
import { dispatchContentGenerationStep, contentGenerationStepSequence } from "@/lib/content-pipeline/steps"
import { getOpportunity } from "@/lib/opportunity/repo"
import { getPageBriefByOpportunity } from "@/lib/pagebrief/repo"
import { buildPageBriefFromOpportunity } from "@/lib/pagebrief/build"

/** Enqueues exactly one step job for this run — the ONLY function
 * anything (an API route, an approval decision, this worker itself)
 * should call to make a workflow progress. Idempotent per (run, step)
 * while a prior job for that exact step is still active. */
export async function enqueueStepJob(run: WorkflowRun, stepName: string): Promise<Job> {
  const sequence = run.pipeline === "website_discovery" ? websiteDiscoveryStepSequence(stepName) : contentGenerationStepSequence(stepName)
  return enqueue({
    orgId: run.orgId,
    projectId: run.projectId,
    workflowRunId: run.id,
    stepName,
    stepSequence: sequence,
    type: run.pipeline,
    priority: run.priority,
    payload: { stepName },
    idempotencyKey: buildStepJobIdempotencyKey(run.id, stepName),
  })
}

/** Executes exactly one step job. Never runs a step for a run that
 * isn't actually RUNNING right now (§3 step 4 — validate workflow
 * state): a job dequeued while its run is paused/cancelled/already
 * terminal is a no-op — resume()/retry() always explicitly (re)enqueue
 * the correct next step from the real checkpoint, so nothing is lost
 * by dropping a stray job here. */
export async function runOneStepJob(job: Job): Promise<void> {
  if (!job.workflowRunId || !job.stepName) {
    throw new Error(`Job ${job.id} is not a step job (missing workflowRunId/stepName) — cannot dispatch.`)
  }
  const run = await getWorkflowRun(job.workflowRunId, job.orgId)
  if (!run) throw new Error(`Job ${job.id} references workflow run ${job.workflowRunId}, which no longer exists.`)
  if (run.status !== "running") return // paused/cancelled/waiting_approval/terminal — nothing to do; resume()/retry() will re-enqueue explicitly

  if (run.pipeline === "website_discovery") {
    const website = await getWebsite(run.subjectId, run.orgId)
    if (!website) {
      await finalizeWorkflow(run.id, run.orgId, "failed", { errorReason: "The website this run belongs to no longer exists." })
      return
    }
    const outcome = await dispatchWebsiteDiscoveryStep(run, website, job.stepName)
    await applyOutcome(run, outcome)
    return
  }

  // content_generation
  const opportunity = await getOpportunity(run.subjectId, run.orgId)
  if (!opportunity) {
    await finalizeWorkflow(run.id, run.orgId, "failed", { errorReason: "The opportunity this run belongs to no longer exists." })
    return
  }
  const brief = (await getPageBriefByOpportunity(opportunity.id, run.orgId)) ?? (await buildPageBriefFromOpportunity(opportunity))
  const result = await dispatchContentGenerationStep(run, opportunity, brief, job.stepName)
  await applyOutcome(run, result.outcome)
}

async function applyOutcome(run: WorkflowRun, outcome: { kind: string; nextStep?: string; status?: "succeeded" | "failed"; errorReason?: string }): Promise<void> {
  if (outcome.kind === "advance" && outcome.nextStep) {
    // re-fetch the run for a current priority/status snapshot before
    // enqueuing the next step — cheap, and avoids enqueuing against a
    // stale in-memory `run` object from before this step's writes.
    const fresh = await getWorkflowRun(run.id, run.orgId)
    if (fresh && fresh.status === "running") await enqueueStepJob(fresh, outcome.nextStep)
    return
  }
  if (outcome.kind === "terminal") {
    await finalizeWorkflow(run.id, run.orgId, outcome.status === "failed" ? "failed" : "succeeded", { errorReason: outcome.errorReason })
    return
  }
  // "waiting_approval" — nothing to enqueue; the approval decision path
  // (lib/workflow/approval.ts + the approve API route) re-enqueues
  // "decide_publish" once a human decides.
}

export interface StepWorkerTickResult {
  workerId: string
  dequeued: number
  succeeded: number
  retried: number
  deadLettered: number
  leasesReaped: { resetToPending: number; deadLettered: number }
  errors: { jobId: string; error: string }[]
}

/** The real worker tick (§3, §7 — Phase 4's ADR-022 unchanged): drains
 * up to `maxJobs` due step jobs, each a single bounded step, and sweeps
 * expired leases first so a crashed prior worker's stuck jobs are
 * recovered before this tick even starts dequeuing new work. */
export async function processStepQueue(maxJobs = 10): Promise<StepWorkerTickResult> {
  const leasesReaped = await reapExpiredLeases()
  const workerId = `worker_${randomUUID()}`
  const jobs = await dequeue(workerId, maxJobs)
  const result: StepWorkerTickResult = { workerId, dequeued: jobs.length, succeeded: 0, retried: 0, deadLettered: 0, leasesReaped, errors: [] }

  for (const job of jobs) {
    try {
      await runOneStepJob(job)
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
        // A non-retryable (or attempts-exhausted) step failure is a real
        // workflow failure, not just a queue-internal one — surface it
        // to the WorkflowRun itself rather than leaving it stuck RUNNING
        // forever with no forward progress and no visible failure.
        if (job.workflowRunId) {
          await finalizeWorkflow(job.workflowRunId, job.orgId, "failed", { errorReason: message }).catch(() => {
            // the run may already be terminal (e.g. a race with a
            // separate cancellation) — the dead-lettered job itself is
            // the durable record either way.
          })
        }
      }
    }
  }
  return result
}

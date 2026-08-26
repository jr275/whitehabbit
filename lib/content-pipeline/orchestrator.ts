import "server-only"

/* ================================================================== *
 * CONTENT GENERATION — LegacySyncExecutionAdapter (Phase 5A, ADR-023).
 *
 * Same relationship to lib/content-pipeline/steps.ts as
 * lib/website-discovery/orchestrator.ts has to lib/website-discovery/
 * steps.ts — see that file's header for the full rationale. The real,
 * HTTP-facing execution path enqueues one step job and returns; this
 * function is a thin in-process loop over the same step-dispatch
 * function, for tests/internal callers that want a synchronous result.
 *
 * One real difference from website discovery: this pipeline can reach
 * WAITING_APPROVAL, which is a genuine pause, not a bug — the loop
 * below stops there and returns approvalRequested: true rather than
 * looping forever waiting for a human who isn't going to appear inside
 * this function call.
 * ================================================================== */

import { finalizeWorkflow, workflowEngine } from "@/lib/workflow/engine"
import type { WorkflowRun } from "@/lib/workflow/types"
import type { Opportunity } from "@/lib/opportunity/model"
import { updateOpportunityStatus } from "@/lib/opportunity/repo"
import type { PageBrief } from "@/lib/pagebrief/model"
import type { Page } from "@/lib/pages/model"
import { ContentGenerationBlockedError, dispatchContentGenerationStep, nextContentGenerationStep } from "./steps"

export { ContentGenerationBlockedError }

export interface ContentGenerationResult {
  agentRunId: string
  page: Page
  autoPublished: boolean
  approvalRequested: boolean
}

export async function runContentGeneration(opportunity: Opportunity, brief: PageBrief): Promise<ContentGenerationResult> {
  const run: WorkflowRun = await workflowEngine.start({
    orgId: opportunity.orgId,
    projectId: opportunity.projectId,
    pipeline: "content_generation",
    subjectType: "opportunity",
    subjectId: opportunity.id,
  })
  await updateOpportunityStatus(opportunity.id, opportunity.orgId, "generating")

  try {
    let current = nextContentGenerationStep(run.checkpoint?.lastCompletedSequence ?? null)
    let page: Page | undefined
    let autoPublished = false
    let approvalRequested = false

    while (current) {
      const result = await dispatchContentGenerationStep(run, opportunity, brief, current)
      if (result.page) page = result.page
      if (result.autoPublished) autoPublished = true
      if (result.approvalRequested) approvalRequested = true

      if (result.outcome.kind === "advance") {
        current = result.outcome.nextStep
        continue
      }
      if (result.outcome.kind === "waiting_approval") {
        break // a real pause — nothing more this synchronous call can do
      }
      // terminal
      await finalizeWorkflow(run.id, run.orgId, result.outcome.status === "failed" ? "failed" : "succeeded", { errorReason: result.outcome.errorReason })
      break
    }

    if (!page) throw new Error("Content generation completed without producing a page — this should never happen.")
    return { agentRunId: run.id, page, autoPublished, approvalRequested }
  } catch (err) {
    if (err instanceof ContentGenerationBlockedError) {
      await finalizeWorkflow(run.id, run.orgId, "failed", { errorReason: err.message }).catch(() => {})
      await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")
      throw err
    }
    const message = err instanceof Error ? err.message : "Content generation failed for an unknown reason."
    await finalizeWorkflow(run.id, run.orgId, "failed", { errorReason: message }).catch(() => {})
    await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")
    throw err
  }
}

import "server-only"

/* POST /api/opportunities/:id/generate — §13's "Generate" action:
 * starts the Content Generation Pipeline (Research -> Outline -> Draft
 * -> SEO -> GEO -> Quality -> decide/publish) as a durable WorkflowRun.
 * Only callable on an "approved" Opportunity.
 *
 * Phase 5A (ADR-023): this request NEVER runs the pipeline itself — it
 * starts the WorkflowRun, enqueues exactly the first step job, and
 * returns immediately. Poll GET /api/v1/workflows/:id (or its SSE
 * /events stream) for progress; the eventual Page is reachable via
 * GET /api/pages/:id once the run reaches a page-producing step. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getOpportunity, updateOpportunityStatus } from "@/lib/opportunity/repo"
import { buildPageBriefFromOpportunity } from "@/lib/pagebrief/build"
import { getPageBriefByOpportunity } from "@/lib/pagebrief/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { assertCapability } from "@/lib/workflow/permissions"
import { workflowEngine } from "@/lib/workflow/engine"
import { enqueueStepJob } from "@/lib/workflow/step-worker"
import { nextContentGenerationStep } from "@/lib/content-pipeline/steps"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("opportunities.generate", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("opportunity_generate", organizationId)
    const { id } = await params

    const opportunity = await getOpportunity(id, organizationId)
    if (!opportunity) throw new NotFoundError()
    if (opportunity.status !== "approved") {
      throw new ValidationError(`Opportunity is "${opportunity.status}" — only an "approved" opportunity can be generated.`)
    }

    const brief = (await getPageBriefByOpportunity(opportunity.id, organizationId)) ?? (await buildPageBriefFromOpportunity(opportunity))
    assertCapability("ContentGenerationAgent", "write_page_brief")
    // idempotent: reattaches to an already-active run for this
    // opportunity rather than starting a second one (§6).
    const run = await workflowEngine.start({
      orgId: opportunity.orgId,
      projectId: opportunity.projectId,
      pipeline: "content_generation",
      subjectType: "opportunity",
      subjectId: opportunity.id,
    })
    const nextStep = nextContentGenerationStep(run.checkpoint?.lastCompletedSequence ?? null)
    if (nextStep) await enqueueStepJob(run, nextStep)
    await updateOpportunityStatus(opportunity.id, organizationId, "generating")

    await recordAudit({ orgId: organizationId, userId, action: "opportunity.generate", resourceType: "opportunity", resourceId: opportunity.id })
    return NextResponse.json({ pageBrief: brief, workflow: run }, { status: 202 })
  })
}

import "server-only"

/* POST /api/v1/workflows/:id/resume — transitions PAUSED/WAITING back
 * to RUNNING and re-invokes the real orchestrator for this run's
 * subject, which (thanks to per-step checkpointing) skips every
 * already-succeeded step and continues from the real checkpoint (§4). */

import { NextResponse } from "next/server"
import { ConflictError, NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { runWebsiteDiscovery } from "@/lib/website-discovery/orchestrator"
import { getWebsite } from "@/lib/websites/repo"
import { runContentGeneration } from "@/lib/content-pipeline/orchestrator"
import { getOpportunity } from "@/lib/opportunity/repo"
import { buildPageBriefFromOpportunity } from "@/lib/pagebrief/build"
import { getPageBriefByOpportunity } from "@/lib/pagebrief/repo"
import { workflowEngine } from "@/lib/workflow/engine"
import { InvalidWorkflowTransitionError } from "@/lib/workflow/types"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.workflows.resume", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await workflowEngine.getStatus(id, organizationId)
    if (!existing) throw new NotFoundError()

    try {
      await workflowEngine.resume(id, organizationId)
    } catch (err) {
      if (err instanceof InvalidWorkflowTransitionError) throw new ConflictError(err.message)
      throw err
    }
    await recordAudit({ orgId: organizationId, userId, action: "workflow.resume", resourceType: "workflow_run", resourceId: id })

    if (existing.pipeline === "website_discovery") {
      const website = await getWebsite(existing.subjectId, organizationId)
      if (!website) throw new ValidationError("The website this run belongs to no longer exists.")
      await runWebsiteDiscovery(website)
    } else if (existing.pipeline === "content_generation") {
      const opportunity = await getOpportunity(existing.subjectId, organizationId)
      if (!opportunity) throw new ValidationError("The opportunity this run belongs to no longer exists.")
      const brief = (await getPageBriefByOpportunity(opportunity.id, organizationId)) ?? (await buildPageBriefFromOpportunity(opportunity))
      await runContentGeneration(opportunity, brief)
    }

    const updated = await workflowEngine.getStatus(id, organizationId)
    return NextResponse.json({ workflow: updated })
  })
}

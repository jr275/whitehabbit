import "server-only"

/* POST /api/opportunities/:id/generate — §13's "Generate" action /
 * §14-15: approved Opportunity -> PageBrief -> Content Generation
 * Pipeline (Research -> Outline -> Draft -> SEO -> GEO -> Quality) ->
 * Page (+ PageVersion). Only callable on an "approved" Opportunity.
 *
 * Runs synchronously (ADR-003 — no durable workflow engine yet); the
 * one real LLM call in this path (the Writer step) reports "blocked"
 * honestly (503) rather than fabricating a draft if no LLM credential
 * is configured. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { ContentGenerationBlockedError, runContentGeneration } from "@/lib/content-pipeline/orchestrator"
import { getOpportunity } from "@/lib/opportunity/repo"
import { buildPageBriefFromOpportunity } from "@/lib/pagebrief/build"
import { getPageBriefByOpportunity } from "@/lib/pagebrief/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

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
    await recordAudit({ orgId: organizationId, userId, action: "opportunity.generate", resourceType: "opportunity", resourceId: opportunity.id })

    try {
      const result = await runContentGeneration(opportunity, brief)
      return NextResponse.json({ pageBrief: brief, agentRunId: result.agentRunId, page: result.page })
    } catch (err) {
      if (err instanceof ContentGenerationBlockedError) {
        return NextResponse.json({ error: err.message, pageBrief: brief }, { status: 503 })
      }
      throw err
    }
  })
}

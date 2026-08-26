import "server-only"

/* POST /api/v1/research — runs the real Deep Research Agent (§22) for
 * an Opportunity: "what evidence would make this opportunity
 * materially better than existing pages?" Computed on demand from
 * already-persisted real data — not a stored artifact of its own in
 * this revision (see ADR-024). */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { getOpportunity } from "@/lib/opportunity/repo"
import { runDeepResearch } from "@/lib/intelligence/deep-research"
import { requireSession } from "@/lib/session"

export async function POST(req: Request) {
  return withApiHandler("v1.research.run", async () => {
    const { organizationId } = await requireSession()
    const body = (await req.json()) as { opportunityId?: string }
    if (!body.opportunityId) throw new ValidationError("opportunityId is required.")
    const opportunity = await getOpportunity(body.opportunityId, organizationId)
    if (!opportunity) throw new NotFoundError()

    const research = await runDeepResearch(organizationId, opportunity.projectId, opportunity)
    return NextResponse.json({ research })
  })
}

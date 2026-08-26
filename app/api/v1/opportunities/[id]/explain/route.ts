import "server-only"

/* GET /api/v1/opportunities/:id/explain — the real, deterministic
 * Opportunity Explanation (§26): "why does this opportunity exist?"
 * assembled from the opportunity's own real fields and its Opportunity
 * Graph edges (§25) — never an LLM asked to justify it after the fact. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getOpportunity } from "@/lib/opportunity/repo"
import { explainOpportunity, listOpportunityGraph } from "@/lib/intelligence/opportunity-graph"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("v1.opportunities.explain", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const opportunity = await getOpportunity(id, organizationId)
    if (!opportunity) throw new NotFoundError()

    const [explanation, graph] = await Promise.all([explainOpportunity(organizationId, opportunity), listOpportunityGraph(organizationId, id)])
    return NextResponse.json({ explanation, graph })
  })
}

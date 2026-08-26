import "server-only"

/* GET /api/v1/opportunities/:id/information-gain — the real Information
 * Gain V2 model (§23) plus the real gate decision (§24): CREATE only
 * above threshold, otherwise a real recommended action (MERGE/ENRICH/
 * WAIT/RESEARCH/CREATE_DATA_ASSET). The fast v1 score
 * (opportunity.informationGainScore) remains what discovery-time
 * scoring uses by default — see ADR-027 for why. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getOpportunity } from "@/lib/opportunity/repo"
import { computeInformationGainV2 } from "@/lib/opportunity/information-gain-v2"
import { buildInformationGainV2Input } from "@/lib/opportunity/information-gain-v2-input"
import { evaluateInformationGainGate } from "@/lib/opportunity/information-gain-gate"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("v1.opportunities.information_gain", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const opportunity = await getOpportunity(id, organizationId)
    if (!opportunity) throw new NotFoundError()

    const { input, hasExistingSimilarPage } = await buildInformationGainV2Input(organizationId, opportunity.projectId, opportunity)
    const result = computeInformationGainV2(input)
    const gate = evaluateInformationGainGate(result, hasExistingSimilarPage)
    return NextResponse.json({ result, gate })
  })
}

import "server-only"

/* GET   /api/opportunities/[id] — one real, org-scoped Opportunity.
 * PATCH /api/opportunities/[id] — approve or reject it (§62's
 *   Opportunity Engine UI actions; ADR-014's status-transition-plus-
 *   audit-log model — no separate version history table exists for
 *   this pre-content planning artifact). The only body accepted is
 *   { decision: "approved" | "rejected" }; anything else is rejected
 *   as invalid, never silently ignored. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getOpportunity, reviewOpportunity } from "@/lib/opportunity/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("opportunities.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const opportunity = await getOpportunity(id, organizationId)
    if (!opportunity) throw new NotFoundError()
    return NextResponse.json({ opportunity })
  })
}

export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler("opportunities.review", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("opportunity_review", organizationId)
    const { id } = await params

    const body = (await req.json().catch(() => null)) as { decision?: string } | null
    if (body?.decision !== "approved" && body?.decision !== "rejected") {
      throw new ValidationError('Body must be { "decision": "approved" | "rejected" }.')
    }

    const updated = await reviewOpportunity(id, organizationId, body.decision, userId)
    if (!updated) {
      // Distinguishes "doesn't exist / isn't yours" (404, via getOpportunity
      // below) from "exists but isn't in a reviewable state" (409) — never
      // collapsed into one generic failure.
      const existing = await getOpportunity(id, organizationId)
      if (!existing) throw new NotFoundError()
      return NextResponse.json({ error: `Opportunity is "${existing.status}" and cannot be ${body.decision === "approved" ? "approved" : "rejected"} from that state.` }, { status: 409 })
    }

    await recordAudit({
      orgId: organizationId,
      userId,
      action: body.decision === "approved" ? "opportunity.approve" : "opportunity.reject",
      resourceType: "opportunity",
      resourceId: id,
    })
    return NextResponse.json({ opportunity: updated })
  })
}

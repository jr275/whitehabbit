import "server-only"

/* PATCH /api/v1/intelligence/decisions/:id — approve or reject a real
 * Decision (§4). Never auto-approved by this endpoint itself — the
 * caller is always a real, authenticated actor, recorded as
 * decidedBy. Rejects a second decision on an already-decided row
 * (decideOnDecision() itself refuses — §4's "never let the system
 * decide its own permission twice" discipline). */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { decideOnDecision, getDecision } from "@/lib/intelligence/decisions"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler("v1.intelligence.decisions.decide", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const body = (await req.json()) as { status?: "approved" | "rejected" | "cancelled" }
    if (!body.status || !["approved", "rejected", "cancelled"].includes(body.status)) throw new ValidationError("status must be one of approved, rejected, cancelled.")

    const existing = await getDecision(id, organizationId)
    if (!existing) throw new NotFoundError()
    if (existing.status !== "pending") throw new ValidationError(`This decision is already ${existing.status} and can't be decided again.`)

    const updated = await decideOnDecision(id, organizationId, body.status, userId)
    if (!updated) throw new ValidationError("This decision could not be decided — it may have already been resolved.")
    await recordAudit({ orgId: organizationId, userId, action: "decision.decide", resourceType: "intelligence_decision", resourceId: id, metadata: { status: body.status } })
    return NextResponse.json({ decision: updated })
  })
}

import "server-only"

/* PATCH /api/v1/recommendations/:id — accept/dismiss/complete a real
 * recommendation. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { updateRecommendationStatus, type RecommendationStatus } from "@/lib/intelligence/recommendations"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: RecommendationStatus[] = ["open", "accepted", "dismissed", "done"]

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler("v1.recommendations.update", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const body = (await req.json()) as { status?: RecommendationStatus }
    if (!body.status || !VALID_STATUSES.includes(body.status)) throw new ValidationError(`status must be one of ${VALID_STATUSES.join(", ")}.`)

    const updated = await updateRecommendationStatus(id, organizationId, body.status)
    if (!updated) throw new NotFoundError()
    await recordAudit({ orgId: organizationId, userId, action: "recommendation.update_status", resourceType: "recommendation", resourceId: id, metadata: { status: body.status } })
    return NextResponse.json({ recommendation: updated })
  })
}

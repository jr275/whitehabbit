import "server-only"

/* PATCH /api/knowledge/merge-candidates/:id — approve or reject a
 * pending Entity Resolution merge candidate (§7). Approving sets the
 * candidate entity's canonical_entity_id — a real, auditable merge. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { reviewMergeCandidate } from "@/lib/knowledge/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler("knowledge.merge-candidates.review", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("merge_candidate_review", organizationId)
    const { id } = await params

    const body = (await req.json().catch(() => null)) as { decision?: string } | null
    if (body?.decision !== "approved" && body?.decision !== "rejected") {
      throw new ValidationError('Body must be { "decision": "approved" | "rejected" }.')
    }

    const updated = await reviewMergeCandidate(id, organizationId, body.decision, userId)
    if (!updated) throw new NotFoundError()

    await recordAudit({
      orgId: organizationId,
      userId,
      action: body.decision === "approved" ? "entity_merge.approve" : "entity_merge.reject",
      resourceType: "entity_merge_candidate",
      resourceId: id,
    })
    return NextResponse.json({ candidate: updated })
  })
}

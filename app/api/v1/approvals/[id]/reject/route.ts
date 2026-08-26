import "server-only"

/* POST /api/v1/approvals/:id/reject — the reviewer declines; the
 * workflow is failed with the reviewer's real reason (never silently),
 * and nothing is auto-published (§12, §13). */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { decideApproval, getApproval } from "@/lib/workflow/approval"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("v1.approvals.reject", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await getApproval(id, organizationId)
    if (!existing) throw new NotFoundError()
    if (existing.status !== "pending") throw new ValidationError(`This approval is already ${existing.status} and can't be decided again.`)

    let reason: string | undefined
    try {
      const body = (await req.json()) as { reason?: string }
      reason = body?.reason
    } catch {
      // no body — a reason is optional
    }

    const decided = await decideApproval(id, organizationId, "rejected", userId, reason)
    if (!decided) throw new ValidationError("This approval could not be decided — it may have already been resolved.")
    await recordAudit({ orgId: organizationId, userId, action: "approval.reject", resourceType: "approval", resourceId: id })

    return NextResponse.json({ approval: decided })
  })
}

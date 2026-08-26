import "server-only"

/* GET /api/v1/approvals — pending (or ?status=) human approvals for the
 * authenticated org (§12, §29). Opportunistically expires overdue
 * requests before listing (§12 — never silently left pending forever). */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { expireOverdueApprovals, listApprovals, type ApprovalStatus } from "@/lib/workflow/approval"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected", "expired", "cancelled"]

export async function GET(req: Request) {
  return withApiHandler("v1.approvals.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const statusParam = url.searchParams.get("status")
    const status = statusParam && VALID_STATUSES.includes(statusParam as ApprovalStatus) ? (statusParam as ApprovalStatus) : "pending"
    if (status === "pending") await expireOverdueApprovals(organizationId)
    const approvals = await listApprovals(organizationId, status)
    return NextResponse.json({ approvals })
  })
}

import "server-only"

/* GET /api/approvals — the real, org-scoped Human-in-the-Loop queue. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listApprovals } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("approvals.list", async () => {
    const { organizationId } = await requireSession()
    const status = new URL(req.url).searchParams.get("status") as "pending" | "approved" | "rejected" | null
    const approvals = await listApprovals(organizationId, status ? { status } : undefined)
    return NextResponse.json({ approvals })
  })
}

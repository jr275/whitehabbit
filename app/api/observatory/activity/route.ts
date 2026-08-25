import "server-only"

/* GET /api/observatory/activity — the real activity timeline
 * (section "REAL ACTIVITY TIMELINE"): a bounded, org-scoped read of
 * the real execution_events table, filtered to a curated set of
 * operationally-meaningful event types (task started, stage started,
 * tool invoked, approval requested/granted/rejected, output created,
 * execution completed/failed/blocked) — never every low-level event.
 * Query params: workerId, limit (<=200). */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listRecentActivity } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("observatory.activity", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)

    const workerId = url.searchParams.get("workerId") ?? undefined
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined

    const activity = await listRecentActivity(organizationId, { workerId, limit })
    return NextResponse.json({ activity })
  })
}

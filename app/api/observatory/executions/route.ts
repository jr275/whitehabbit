import "server-only"

/* GET /api/observatory/executions — the real, paginated, server-
 * filtered "recent executions" list (section "RECENT EXECUTIONS").
 * Each row already carries its worker name, output count, latest
 * approval state and max retry attempt — the client renders it
 * directly, no second round-trip. Clicking a row is a plain link to
 * /outputs?execution=<id> — the SAME OutputDrawer/execution
 * experience Outputs already has; this route never returns execution
 * detail/trace itself (see GET /api/executions/[id] for that).
 *
 * Query params: workerId, status, sinceMs, untilMs, approvalState
 * (pending|approved|rejected|none), limit (<=100), offset. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listExecutionsDetailed, type ExecutionListFilters } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("observatory.executions", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)

    const filters: ExecutionListFilters = {}
    const workerId = url.searchParams.get("workerId")
    if (workerId) filters.workerId = workerId
    const status = url.searchParams.get("status")
    if (status) filters.status = status as ExecutionListFilters["status"]
    const sinceMs = url.searchParams.get("sinceMs")
    if (sinceMs) filters.sinceMs = Number(sinceMs)
    const untilMs = url.searchParams.get("untilMs")
    if (untilMs) filters.untilMs = Number(untilMs)
    const approvalState = url.searchParams.get("approvalState")
    if (approvalState) filters.approvalState = approvalState as ExecutionListFilters["approvalState"]

    const limit = Number(url.searchParams.get("limit") ?? 25)
    const offset = Number(url.searchParams.get("offset") ?? 0)

    const result = await listExecutionsDetailed(organizationId, filters, limit, offset)
    return NextResponse.json(result)
  })
}

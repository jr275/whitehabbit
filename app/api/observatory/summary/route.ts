import "server-only"

/* GET /api/observatory/summary — the real Observatory's headline
 * numbers (section "REAL OBSERVABILITY METRICS"). Every field comes
 * from a real SQL aggregate over the same executions/outputs/
 * approvals tables Studio/Outputs/Approvals already write — no demo
 * store, no client-side aggregation over a capped row list, no
 * fabricated metric. Read-only, org-scoped via requireSession().
 *
 * Optional query params mirror the recent-executions list's filters
 * so the summary strip and the table below it can share one filter
 * bar: workerId, status, sinceMs, untilMs. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { getExecutionSummary, type ExecutionFilters } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("observatory.summary", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)

    const filters: ExecutionFilters = {}
    const workerId = url.searchParams.get("workerId")
    if (workerId) filters.workerId = workerId
    const status = url.searchParams.get("status")
    if (status) filters.status = status as ExecutionFilters["status"]
    const sinceMs = url.searchParams.get("sinceMs")
    if (sinceMs) filters.sinceMs = Number(sinceMs)
    const untilMs = url.searchParams.get("untilMs")
    if (untilMs) filters.untilMs = Number(untilMs)

    const summary = await getExecutionSummary(organizationId, filters)
    return NextResponse.json({ summary })
  })
}

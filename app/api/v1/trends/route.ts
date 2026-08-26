import "server-only"

/* GET /api/v1/trends — real, tenant-scoped Trend rows (§15).
 * POST /api/v1/trends/scan runs the real detector — see that route. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { listTrends, type TrendState } from "@/lib/intelligence/trends"
import { requireSession } from "@/lib/session"

const VALID_STATES: TrendState[] = ["emerging", "rising", "stable", "declining", "breaking"]

export async function GET(req: Request) {
  return withApiHandler("v1.trends.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const stateParam = url.searchParams.get("state")
    const state = stateParam && VALID_STATES.includes(stateParam as TrendState) ? (stateParam as TrendState) : undefined
    const trends = await listTrends(organizationId, projectId, { state })
    return NextResponse.json({ trends })
  })
}

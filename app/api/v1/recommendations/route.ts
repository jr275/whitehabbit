import "server-only"

/* GET /api/v1/recommendations — real recommendations (§33).
 * POST triggers real generation over already-persisted data. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { generateRecommendations, listRecommendations, type RecommendationStatus } from "@/lib/intelligence/recommendations"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: RecommendationStatus[] = ["open", "accepted", "dismissed", "done"]

export async function GET(req: Request) {
  return withApiHandler("v1.recommendations.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const statusParam = url.searchParams.get("status")
    const status = statusParam && VALID_STATUSES.includes(statusParam as RecommendationStatus) ? (statusParam as RecommendationStatus) : "open"
    const recommendations = await listRecommendations(organizationId, projectId, { status })
    return NextResponse.json({ recommendations })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.recommendations.generate", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const created = await generateRecommendations(organizationId, body.projectId)
    await recordAudit({ orgId: organizationId, userId, action: "recommendations.generate", resourceType: "project", resourceId: body.projectId, metadata: { created: created.length } })
    return NextResponse.json({ recommendations: created }, { status: 201 })
  })
}

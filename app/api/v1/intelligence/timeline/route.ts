import "server-only"

/* GET /api/v1/intelligence/timeline — the real, event-based Intelligence
 * Timeline (§8, §19): a chronological merge of Signal/Observation/
 * Decision/Action/Outcome for a project, each entry pointing at its
 * real row. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { buildIntelligenceTimeline } from "@/lib/intelligence/timeline"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.timeline", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const limitParam = Number(url.searchParams.get("limit"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined
    const entries = await buildIntelligenceTimeline(organizationId, projectId, limit)
    return NextResponse.json({ entries })
  })
}

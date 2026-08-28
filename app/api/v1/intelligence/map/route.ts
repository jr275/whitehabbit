import "server-only"

/* GET /api/v1/intelligence/map — the real Opportunity Map graph (§6,
 * §10, §19): real nodes and edges assembled from persisted
 * Observations/Decisions and their real intelligence_relations edges —
 * never decorative layout data. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { buildIntelligenceMap } from "@/lib/intelligence/map"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.map", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const map = await buildIntelligenceMap(organizationId, projectId)
    return NextResponse.json(map)
  })
}

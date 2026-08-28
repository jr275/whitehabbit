import "server-only"

/* GET /api/v1/intelligence/map — the real Intelligence Graph (§6, §9,
 * §10, §19, Phase 8 ADR-044): real nodes and edges, server-filtered
 * and bounded — never the whole graph shipped for client-side
 * filtering. `mode` selects which real subgraph to build (all through
 * the one shared lib/intelligence/map.ts#buildGraph() dispatcher);
 * defaults to "decisions" (the original Phase 6G shape) for backward
 * compatibility with existing callers. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { buildGraph, type GraphMode } from "@/lib/intelligence/map"
import { requireSession } from "@/lib/session"

const VALID_MODES: GraphMode[] = ["decisions", "opportunities", "knowledge", "markets", "roles", "intents", "pages"]

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.map", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const modeParam = url.searchParams.get("mode")
    const mode = modeParam && VALID_MODES.includes(modeParam as GraphMode) ? (modeParam as GraphMode) : "decisions"
    const entityType = url.searchParams.get("entityType") ?? undefined
    const status = url.searchParams.get("status") ?? undefined
    const minScoreParam = Number(url.searchParams.get("minScore"))
    const minScore = Number.isFinite(minScoreParam) && url.searchParams.get("minScore") ? minScoreParam : undefined
    const limitParam = Number(url.searchParams.get("limit"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined

    const map = await buildGraph(organizationId, projectId, { mode, entityType, status, minScore, limit })
    return NextResponse.json({ ...map, mode })
  })
}

import "server-only"

/* GET /api/v1/intelligence/timeline — the real, event-based Intelligence
 * Timeline (§8, §12, §19): a chronological merge of Signal/Observation/
 * Decision/Action/Outcome for a project, each entry pointing at its
 * real row. Filters (type/entity/date range/search) are applied server-
 * side in lib/intelligence/timeline.ts — the client never fetches the
 * unfiltered set and narrows it in the browser. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { buildIntelligenceTimeline, type TimelineEntryType } from "@/lib/intelligence/timeline"
import { requireSession } from "@/lib/session"

const VALID_TYPES: TimelineEntryType[] = ["signal", "observation", "decision", "action", "outcome"]

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
    const typesParam = url.searchParams.get("types")
    const types = typesParam
      ? typesParam.split(",").map((t) => t.trim()).filter((t): t is TimelineEntryType => VALID_TYPES.includes(t as TimelineEntryType))
      : undefined
    const entityId = url.searchParams.get("entityId") ?? undefined
    const search = url.searchParams.get("q") ?? undefined
    const sinceParam = Number(url.searchParams.get("since"))
    const since = Number.isFinite(sinceParam) && url.searchParams.get("since") ? sinceParam : undefined
    const untilParam = Number(url.searchParams.get("until"))
    const until = Number.isFinite(untilParam) && url.searchParams.get("until") ? untilParam : undefined

    const entries = await buildIntelligenceTimeline(organizationId, projectId, { limit, types, entityId, search, since, until })
    return NextResponse.json({ entries })
  })
}

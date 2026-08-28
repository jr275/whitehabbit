import "server-only"

/* GET /api/v1/intelligence/mission — Phase 7 (§16, ADR-040): the real,
 * aggregated KPI snapshot Mission Control's home screen renders. Every
 * field is a real, current count/average — never hardcoded. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getOrCreateDefaultProject, getProject } from "@/lib/projects/repo"
import { buildMissionSnapshot } from "@/lib/intelligence/mission"
import { requireSession } from "@/lib/session"

/* projectId is optional here (unlike the rest of /intelligence/*) —
 * Mission Control is the org's single home screen and this app has no
 * real project-switcher UI yet (risks.md R-12), so it defaults to the
 * same real getOrCreateDefaultProject() every legacy /api/opportunities-
 * style route already uses, while still honoring an explicit projectId
 * for a future multi-project UI. */
export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.mission", async () => {
    const { organizationId } = await requireSession()
    const explicit = new URL(req.url).searchParams.get("projectId")
    const project = explicit ? await getProject(explicit, organizationId) : await getOrCreateDefaultProject(organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const snapshot = await buildMissionSnapshot(organizationId, project.id)
    return NextResponse.json({ snapshot, projectId: project.id })
  })
}

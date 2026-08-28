import "server-only"

/* GET /api/v1/intelligence/next-action — Phase 7 (§17, ADR-040): "What
 * should I do next?" — the single, highest-value real pending
 * Decision, its real ActionPlan, and the real PolicyEngine read on it.
 * `nextAction: null` when there is honestly nothing pending. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getOrCreateDefaultProject, getProject } from "@/lib/projects/repo"
import { resolveNextAction } from "@/lib/intelligence/mission"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.next_action", async () => {
    const { organizationId } = await requireSession()
    const explicit = new URL(req.url).searchParams.get("projectId")
    const project = explicit ? await getProject(explicit, organizationId) : await getOrCreateDefaultProject(organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const nextAction = await resolveNextAction(organizationId, project.id)
    return NextResponse.json({ nextAction, projectId: project.id })
  })
}

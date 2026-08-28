import "server-only"

/* GET /api/v1/intelligence/actions — real Action records (§4, §12,
 * §19). Read-only by design: an Action IS a real agent_runs pointer
 * (lib/intelligence/actions.ts), created only by real internal
 * execution paths that dispatch a real agent — never fabricated by an
 * API client posting a bare status. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { listActions, listActionsForDecision, type ActionStatus } from "@/lib/intelligence/actions"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: ActionStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"]

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.actions.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const decisionId = url.searchParams.get("decisionId")
    if (decisionId) {
      const actions = await listActionsForDecision(organizationId, decisionId)
      return NextResponse.json({ actions })
    }
    const statusParam = url.searchParams.get("status")
    const status = statusParam && VALID_STATUSES.includes(statusParam as ActionStatus) ? (statusParam as ActionStatus) : undefined
    const actions = await listActions(organizationId, projectId, { status })
    return NextResponse.json({ actions })
  })
}

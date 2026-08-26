import "server-only"

/* POST /api/v1/workflows/:id/cancel — real state-machine-validated
 * transition (§3, §29). */

import { NextResponse } from "next/server"
import { ConflictError, NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { workflowEngine } from "@/lib/workflow/engine"
import { InvalidWorkflowTransitionError } from "@/lib/workflow/types"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.workflows.cancel", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await workflowEngine.getStatus(id, organizationId)
    if (!existing) throw new NotFoundError()
    try {
      const run = await workflowEngine.cancel(id, organizationId)
      await recordAudit({ orgId: organizationId, userId, action: "workflow.cancel", resourceType: "workflow_run", resourceId: id })
      return NextResponse.json({ workflow: run })
    } catch (err) {
      if (err instanceof InvalidWorkflowTransitionError) throw new ConflictError(err.message)
      throw err
    }
  })
}

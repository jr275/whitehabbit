import "server-only"

/* GET /api/v1/workflows/:id — WorkflowRun detail + step timeline. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getWorkflowRun, listSteps } from "@/lib/workflow/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("v1.workflows.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const run = await getWorkflowRun(id, organizationId)
    if (!run) throw new NotFoundError()
    const steps = await listSteps(id, organizationId)
    return NextResponse.json({ workflow: run, steps })
  })
}

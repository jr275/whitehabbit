import "server-only"

/* GET /api/agent-runs/:id — WorkflowRun detail (§27): the run itself
 * plus its full step timeline. Never exposes a secret — steps only
 * ever carry small structured summaries (see lib/workflow/repo.ts's
 * startStep()/completeStep()), never a raw credential/token. See also
 * /api/v1/workflows/:id for the fuller Agent Control Center API (§29). */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getWorkflowRun, listSteps } from "@/lib/workflow/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("agent-runs.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const run = await getWorkflowRun(id, organizationId)
    if (!run) throw new NotFoundError()
    const steps = await listSteps(id, organizationId)
    return NextResponse.json({ run, steps })
  })
}

import "server-only"

/* GET /api/agent-runs/:id — Agent Run detail (§27): the run itself
 * plus its full step timeline. Never exposes a secret — steps only
 * ever carry small structured summaries (see lib/agent-runs/repo.ts's
 * runStep()), never a raw credential/token. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getAgentRun, listStepsForRun } from "@/lib/agent-runs/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("agent-runs.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const run = await getAgentRun(id, organizationId)
    if (!run) throw new NotFoundError()
    const steps = await listStepsForRun(id, organizationId)
    return NextResponse.json({ run, steps })
  })
}

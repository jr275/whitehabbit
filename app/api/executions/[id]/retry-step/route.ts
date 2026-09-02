import "server-only"

/* POST /api/executions/[id]/retry-step — section 18/19: retry ONLY a
 * failed step of a resumable pipeline's SAME execution, never
 * replaying an external action that already succeeded (e.g. Salesforce
 * completed but Slack failed — this retries Slack alone). See
 * lib/agent/runtime.ts's retryFailedStage() for the real mechanics. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { retryFailedStage } from "@/lib/agent/runtime"
import { recordAudit } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("executions.retryStep", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params

    const body = (await req.json().catch(() => null)) as { stage?: string } | null
    if (!body?.stage) throw new ValidationError('"stage" is required.')

    const outcome = await retryFailedStage(id, organizationId, body.stage)
    if ("error" in outcome) {
      if (outcome.error === "Execution not found.") throw new NotFoundError()
      throw new ValidationError(outcome.error)
    }

    await recordAudit({ orgId: organizationId, userId, action: "execution.retry_step", resourceType: "execution", resourceId: id, metadata: { stage: body.stage } })
    return NextResponse.json({ execution: outcome.execution })
  })
}

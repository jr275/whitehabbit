import "server-only"

/* POST /api/v1/workflows/:id/retry — manual retry of a terminal
 * FAILED/TIMED_OUT run. Moves FAILED/TIMED_OUT -> RETRYING -> RUNNING
 * (§3) and enqueues exactly the next step job from the real checkpoint
 * (Phase 5A ADR-023) — never re-runs the whole pipeline inline. */

import { NextResponse } from "next/server"
import { ConflictError, NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { workflowEngine } from "@/lib/workflow/engine"
import { InvalidWorkflowTransitionError } from "@/lib/workflow/types"
import { enqueueStepJob } from "@/lib/workflow/step-worker"
import { nextWebsiteDiscoveryStep } from "@/lib/website-discovery/steps"
import { nextContentGenerationStep } from "@/lib/content-pipeline/steps"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.workflows.retry", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await workflowEngine.getStatus(id, organizationId)
    if (!existing) throw new NotFoundError()

    let retried
    try {
      retried = await workflowEngine.retry(id, organizationId)
    } catch (err) {
      if (err instanceof InvalidWorkflowTransitionError) throw new ConflictError(err.message)
      throw err
    }
    await recordAudit({ orgId: organizationId, userId, action: "workflow.retry", resourceType: "workflow_run", resourceId: id })

    const nextStep =
      retried.pipeline === "website_discovery"
        ? nextWebsiteDiscoveryStep(retried.checkpoint?.lastCompletedSequence ?? null)
        : nextContentGenerationStep(retried.checkpoint?.lastCompletedSequence ?? null)
    if (nextStep) await enqueueStepJob(retried, nextStep)

    return NextResponse.json({ workflow: retried })
  })
}

import "server-only"

/* POST /api/v1/workflows/:id/resume — transitions PAUSED/WAITING back
 * to RUNNING and enqueues exactly the next step job, computed from the
 * run's real checkpoint (§4, Phase 5A ADR-023) — never re-executes the
 * whole pipeline inline. Checkpoint-resume means that next step (and
 * every one after it) skips any work already durably completed. */

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
  return withApiHandler("v1.workflows.resume", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await workflowEngine.getStatus(id, organizationId)
    if (!existing) throw new NotFoundError()

    let resumed
    try {
      resumed = await workflowEngine.resume(id, organizationId)
    } catch (err) {
      if (err instanceof InvalidWorkflowTransitionError) throw new ConflictError(err.message)
      throw err
    }
    await recordAudit({ orgId: organizationId, userId, action: "workflow.resume", resourceType: "workflow_run", resourceId: id })

    const nextStep =
      resumed.pipeline === "website_discovery"
        ? nextWebsiteDiscoveryStep(resumed.checkpoint?.lastCompletedSequence ?? null)
        : nextContentGenerationStep(resumed.checkpoint?.lastCompletedSequence ?? null)
    if (nextStep) await enqueueStepJob(resumed, nextStep)

    return NextResponse.json({ workflow: resumed })
  })
}

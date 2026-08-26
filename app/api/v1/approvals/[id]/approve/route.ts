import "server-only"

/* POST /api/v1/approvals/:id/approve — the one real path a human takes
 * to unblock a WAITING_APPROVAL workflow (§12, §13: "never let an LLM
 * decide its own permission" — this route is the only writer of an
 * 'approved' decision, and it always runs as the authenticated
 * reviewer, never the requesting agent). Resumes the workflow and
 * enqueues the "decide_publish" step job (Phase 5A, ADR-023) — never
 * runs the pipeline inline within this request. Re-dispatching
 * "decide_publish" finds the approval already decided and proceeds to
 * publish (or reports rejection) — the same idempotent check that made
 * this safe before Phase 5A, unchanged in substance. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { decideApproval, getApproval } from "@/lib/workflow/approval"
import { workflowEngine } from "@/lib/workflow/engine"
import { enqueueStepJob } from "@/lib/workflow/step-worker"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("v1.approvals.approve", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await getApproval(id, organizationId)
    if (!existing) throw new NotFoundError()
    if (existing.status !== "pending") throw new ValidationError(`This approval is already ${existing.status} and can't be decided again.`)

    let reason: string | undefined
    try {
      const body = (await req.json()) as { reason?: string }
      reason = body?.reason
    } catch {
      // no body — a reason is optional
    }

    const decided = await decideApproval(id, organizationId, "approved", userId, reason)
    if (!decided) throw new ValidationError("This approval could not be decided — it may have already been resolved.")
    await recordAudit({ orgId: organizationId, userId, action: "approval.approve", resourceType: "approval", resourceId: id })

    const run = await workflowEngine.getStatus(existing.workflowRunId, organizationId)
    if (run && run.pipeline === "content_generation") {
      await enqueueStepJob(run, "decide_publish")
    }

    return NextResponse.json({ approval: decided })
  })
}

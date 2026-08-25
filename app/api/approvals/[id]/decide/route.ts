import "server-only"

/* POST /api/approvals/[id]/decide — the real Human-in-the-Loop
 * decision (section "PHASE 6 — APPROVAL GATE").
 *
 * REJECT: marks the request rejected. Nothing runs — the action never
 * happens, safely.
 *
 * APPROVE: there is no durable workflow engine in this architecture to
 * literally suspend and resume the exact interrupted skill.execute()
 * call — runToolAction() (lib/agent/tool-runner.ts) already threw and
 * unwound before this route ever runs. What IS real and honest:
 * Approve looks up the exact real Tool/Action this request captured
 * and calls its real run() directly, with the exact real input that
 * was blocked — the real-world effect (the Salesforce update, the
 * Slack message) genuinely happens now, for real, the moment a human
 * says yes. This is "the action executes for real upon approval," not
 * "the suspended execution resumes" — a real, load-bearing distinction
 * this route's behavior must actually match, never overclaim. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { decideApproval, getApproval, recordAudit } from "@/lib/db/repo"
import { toolsMapForOrg } from "@/lib/agent/tools/connector-tools"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("approvals.decide", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params

    const approval = await getApproval(id, organizationId)
    if (!approval) throw new NotFoundError()
    if (approval.status !== "pending") throw new ValidationError(`This approval was already ${approval.status}.`)

    const body = (await req.json().catch(() => null)) as { decision?: "approve" | "reject" } | null
    if (body?.decision !== "approve" && body?.decision !== "reject") throw new ValidationError('"decision" must be "approve" or "reject".')

    if (body.decision === "reject") {
      const updated = await decideApproval(id, organizationId, { status: "rejected", decidedBy: userId })
      await recordAudit({ orgId: organizationId, userId, action: "approval_rejected", resourceType: "approval", resourceId: id, metadata: { toolId: approval.toolId, actionId: approval.actionId } })
      return NextResponse.json({ approval: updated })
    }

    // Approve — run the real, captured action now.
    const tools = await toolsMapForOrg(organizationId)
    const tool = tools.get(approval.toolId)
    const action = tool?.actions.find((a) => a.id === approval.actionId)

    let result: unknown
    if (!tool || !action) {
      result = { ok: false, error: `"${approval.actionLabel}" on ${approval.toolName} is no longer available (disconnected or reconfigured since this request was made).` }
    } else if (!tool.isConnected()) {
      result = { ok: false, error: `${approval.toolName} is no longer connected.` }
    } else {
      result = await action.run(approval.input, { workerId: approval.workerId, executionId: approval.executionId ?? "", emit: () => {} })
    }

    const updated = await decideApproval(id, organizationId, { status: "approved", decidedBy: userId, result })
    await recordAudit({ orgId: organizationId, userId, action: "approval_approved", resourceType: "approval", resourceId: id, metadata: { toolId: approval.toolId, actionId: approval.actionId } })
    return NextResponse.json({ approval: updated })
  })
}

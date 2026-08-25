import "server-only"

/* POST /api/approvals/[id]/decide — the real Human-in-the-Loop
 * decision (section "PHASE 6 — APPROVAL GATE").
 *
 * REJECT: marks the request rejected. Nothing runs — the action never
 * happens, safely. For a resumable pipeline skill (approval.
 * resumeState set), the SAME execution is also finalized — its stage
 * marked "rejected", everything genuinely still queued downstream
 * marked "skipped" — never left looking merely unstarted forever.
 *
 * APPROVE: there is no durable workflow engine in this architecture to
 * literally suspend and resume the exact interrupted skill.execute()
 * call — runToolAction() (lib/agent/tool-runner.ts) already threw and
 * unwound before this route ever runs. What IS real and honest:
 * Approve looks up the exact real Tool/Action this request captured
 * and calls its real run() directly, with the exact real input that
 * was blocked — the real-world effect (the Salesforce update, the
 * Slack message) genuinely happens now, for real, the moment a human
 * says yes. When the blocked skill implements resume() (see lib/
 * agent/runtime.ts's resumeTask), this goes one step further and
 * genuinely CONTINUES the same execution past the approved action —
 * e.g. reaching the Slack step after a Salesforce update is approved
 * — rather than only running the one action in isolation. A skill
 * with no resume() keeps the prior phase's exact behavior. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { decideApproval, getApproval, recordAudit } from "@/lib/db/repo"
import { toolsMapForOrg } from "@/lib/agent/tools/connector-tools"
import { finalizeRejectedExecution, resumeTask } from "@/lib/agent/runtime"
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
      if (approval.resumeState != null) await finalizeRejectedExecution(approval, organizationId)
      await recordAudit({ orgId: organizationId, userId, action: "approval_rejected", resourceType: "approval", resourceId: id, metadata: { toolId: approval.toolId, actionId: approval.actionId } })
      return NextResponse.json({ approval: updated })
    }

    // Approve — a resumable skill continues the SAME execution past
    // the approved action; otherwise (or if resume can't apply — e.g.
    // the tool/action was reconfigured since this request was made)
    // the prior phase's exact "run the one captured action" behavior.
    const resumed = await resumeTask(approval, organizationId)
    let result: unknown
    if (resumed) {
      result = { ok: true, resumed: true, executionId: resumed.execution.id, status: resumed.execution.status }
    } else {
      const tools = await toolsMapForOrg(organizationId)
      const tool = tools.get(approval.toolId)
      const action = tool?.actions.find((a) => a.id === approval.actionId)

      if (!tool || !action) {
        result = { ok: false, error: `"${approval.actionLabel}" on ${approval.toolName} is no longer available (disconnected or reconfigured since this request was made).` }
      } else if (!tool.isConnected()) {
        result = { ok: false, error: `${approval.toolName} is no longer connected.` }
      } else {
        result = await action.run(approval.input, { workerId: approval.workerId, executionId: approval.executionId ?? "", emit: () => {} })
      }
    }

    const updated = await decideApproval(id, organizationId, { status: "approved", decidedBy: userId, result })
    await recordAudit({ orgId: organizationId, userId, action: "approval_approved", resourceType: "approval", resourceId: id, metadata: { toolId: approval.toolId, actionId: approval.actionId } })
    return NextResponse.json({ approval: updated })
  })
}

import "server-only"

/* POST /api/approvals/[id]/decide — the real Human-in-the-Loop
 * decision (section "PHASE 6 — APPROVAL GATE").
 *
 * IDEMPOTENT BY CONSTRUCTION (section 4): claimApproval() is a real
 * atomic compare-and-swap (`UPDATE ... WHERE status = 'pending'`) —
 * it runs FIRST, before any real work happens. Two concurrent
 * requests (a double-click on Approve) can never both win it:
 * Postgres serializes the two UPDATEs to the same row, exactly one
 * matches (status was still 'pending') and flips it, the other
 * matches zero rows and gets null back — that request returns
 * "already decided" immediately, having done no real work at all.
 * Only the winner goes on to actually run/resume anything.
 *
 * REJECT: nothing runs — the action never happens, safely. For a
 * resumable pipeline skill (approval.resumeState set), the SAME
 * execution is also finalized — its stage marked "rejected",
 * everything genuinely still queued downstream marked "skipped".
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
import { claimApproval, getApproval, recordAudit, setApprovalResult } from "@/lib/db/repo"
import { toolsMapForOrg } from "@/lib/agent/tools/connector-tools"
import { finalizeRejectedExecution, resumeTask } from "@/lib/agent/runtime"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("approvals.decide", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params

    const before = await getApproval(id, organizationId)
    if (!before) throw new NotFoundError()

    const body = (await req.json().catch(() => null)) as { decision?: "approve" | "reject" } | null
    if (body?.decision !== "approve" && body?.decision !== "reject") throw new ValidationError('"decision" must be "approve" or "reject".')

    // The real, atomic transition — wins or loses the race right here.
    const claimed = await claimApproval(id, organizationId, body.decision === "approve" ? "approved" : "rejected", userId)
    if (!claimed) {
      // Lost the race (a concurrent decide already won), or this was
      // already decided earlier — either way, idempotent: report the
      // real current state, do NOT perform the action a second time.
      const current = await getApproval(id, organizationId)
      return NextResponse.json({ approval: current, alreadyDecided: true })
    }

    if (body.decision === "reject") {
      if (before.resumeState != null) await finalizeRejectedExecution(before, organizationId)
      await recordAudit({ orgId: organizationId, userId, action: "approval_rejected", resourceType: "approval", resourceId: id, metadata: { toolId: before.toolId, actionId: before.actionId } })
      return NextResponse.json({ approval: claimed })
    }

    // Approve — already atomically claimed above; now do the real
    // work. A resumable skill continues the SAME execution past the
    // approved action; otherwise (or if resume can't apply — e.g. the
    // tool/action was reconfigured since this request was made) the
    // prior phase's exact "run the one captured action" behavior.
    // "lease_busy" is a real, distinct outcome — the same execution
    // is already being resumed/retried elsewhere (section 12) — and
    // must NEVER fall through to the direct-action path below, or the
    // whole point of the lease would be defeated.
    const resumed = await resumeTask(before, organizationId)
    let result: unknown
    if (resumed.ok) {
      result = { ok: true, resumed: true, executionId: resumed.execution.id, status: resumed.execution.status }
    } else if (resumed.reason === "lease_busy") {
      const updated = await setApprovalResult(id, organizationId, { ok: false, error: "This execution is already being resumed elsewhere — the approval was recorded but the action was not re-attempted." })
      await recordAudit({ orgId: organizationId, userId, action: "approval_approved", resourceType: "approval", resourceId: id, metadata: { toolId: before.toolId, actionId: before.actionId, leaseBusy: true } })
      return NextResponse.json({ approval: updated }, { status: 409 })
    } else {
      const tools = await toolsMapForOrg(organizationId)
      const tool = tools.get(before.toolId)
      const action = tool?.actions.find((a) => a.id === before.actionId)

      if (!tool || !action) {
        result = { ok: false, error: `"${before.actionLabel}" on ${before.toolName} is no longer available (disconnected or reconfigured since this request was made).` }
      } else if (!tool.isConnected()) {
        result = { ok: false, error: `${before.toolName} is no longer connected.` }
      } else {
        result = await action.run(before.input, { workerId: before.workerId, executionId: before.executionId ?? "", emit: () => {} })
      }
    }

    const updated = await setApprovalResult(id, organizationId, result)
    await recordAudit({ orgId: organizationId, userId, action: "approval_approved", resourceType: "approval", resourceId: id, metadata: { toolId: before.toolId, actionId: before.actionId } })
    return NextResponse.json({ approval: updated })
  })
}

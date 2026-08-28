import "server-only"

/* POST /api/v1/intelligence/decisions/:id/execute — Phase 7 (§3,
 * ADR-038): the real Decision -> Action bridge entry point. Only ever
 * queues (or, for an unsupported/policy-denied plan, records a real
 * 'blocked' row) and returns — never runs the actual action inline.
 * Idempotent per Decision: a retry, a duplicate approval race, or a
 * second manual call all return the SAME real action. */

import { NextResponse } from "next/server"
import { ConflictError, NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { executeDecision, DecisionNotFoundError, DecisionNotApprovedError } from "@/lib/intelligence/action-executor"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.intelligence.decisions.execute", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("decision_execute", organizationId)
    const { id } = await params

    const { action, plan } = await executeDecision(id, organizationId).catch((err) => {
      if (err instanceof DecisionNotFoundError) throw new NotFoundError()
      if (err instanceof DecisionNotApprovedError) throw new ConflictError(err.message)
      throw err
    })
    await recordAudit({ orgId: organizationId, userId, action: "decision.execute", resourceType: "intelligence_decision", resourceId: id, metadata: { actionId: action.id, status: action.status } })
    return NextResponse.json({ action, plan }, { status: 202 })
  })
}

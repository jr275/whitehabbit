import "server-only"

/* GET /api/v1/intelligence/decisions/:id/action-plan — Phase 7 (§2,
 * ADR-038): a real, read-only preview of the DecisionActionResolver's
 * output for this decision — no side effects, safe to call before
 * approving or executing. Shows whether the action is actually
 * supported by this codebase's real capabilities, and why not when
 * it isn't. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getDecision } from "@/lib/intelligence/decisions"
import { resolveActionPlan } from "@/lib/intelligence/action-plan"
import { evaluatePolicy } from "@/lib/intelligence/policy-engine"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("v1.intelligence.decisions.action_plan", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const decision = await getDecision(id, organizationId)
    if (!decision) throw new NotFoundError()

    const plan = await resolveActionPlan(decision)
    const policy = await evaluatePolicy(plan, decision)
    return NextResponse.json({ plan, policy })
  })
}

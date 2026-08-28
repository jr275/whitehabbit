import "server-only"

/* ================================================================== *
 * POLICY ENGINE (Phase 7, §5, ADR-039) — the real, backend-owned gate
 * evaluated before an ActionExecutor ever dispatches a real execution.
 * Never the agent's own call (§5: "The agent must NEVER decide whether
 * it is allowed to execute itself"). Deliberately does not re-litigate
 * whether this Decision SHOULD be executed — decideOnDecision()
 * (lib/intelligence/decisions.ts) is the one real human-approval gate
 * for that, unchanged from Phase 6. This evaluates whether the
 * approved Decision's ActionPlan can be dispatched RIGHT NOW: is it a
 * real, supported action, does the recommended agent actually hold
 * every capability it needs, is the Decision still fresh (not
 * expired), and does its own estimated cost already exceed this
 * project's real budget ceiling — a real, useful pre-check that avoids
 * starting a doomed run rather than discovering the same
 * BudgetExceededError deep inside step execution.
 * ================================================================== */

import type { ActionPlan } from "./action-plan"
import type { IntelligenceDecision } from "./decisions"
import { hasCapability } from "@/lib/workflow/permissions"
import { resolveBudgetPolicy } from "@/lib/workflow/budget-policy"

export interface PolicyDecision {
  allowed: boolean
  reason: string
}

export async function evaluatePolicy(plan: ActionPlan, decision: IntelligenceDecision): Promise<PolicyDecision> {
  if (plan.status === "unsupported") {
    return { allowed: false, reason: plan.unsupportedReason ?? `No real execution path exists for ${plan.actionType} yet.` }
  }

  if (decision.status !== "approved") {
    return { allowed: false, reason: `Decision is "${decision.status}", not "approved" — the ActionExecutor never dispatches an action for a decision a human hasn't approved.` }
  }

  if (decision.expiresAt != null && decision.expiresAt < Date.now()) {
    return { allowed: false, reason: `STALE_DECISION — this decision expired at ${new Date(decision.expiresAt).toISOString()}; the evidence it was approved on may no longer hold. Re-run the correlation/decision scan for a fresh decision instead.` }
  }

  // §6: fail closed. A plan naming an agent with a capability it
  // doesn't actually hold is BLOCKED, never a best-effort attempt.
  if (plan.agentType) {
    const missing = plan.requiredCapabilities.filter((cap) => !hasCapability(plan.agentType!, cap))
    if (missing.length > 0) {
      return { allowed: false, reason: `MISSING_CAPABILITY — ${plan.agentType} lacks required capabilit${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}.` }
    }
  } else if (plan.requiredCapabilities.length > 0) {
    return { allowed: false, reason: `MISSING_CAPABILITY — this action requires capabilities (${plan.requiredCapabilities.join(", ")}) but no agent is assigned to perform it.` }
  }

  // A real, useful pre-check: the Decision Engine's own estimated cost
  // (lib/intelligence/decision-engine.ts's COST_BY_ACTION) compared
  // against this project's real, resolved budget ceiling — rejecting
  // here avoids starting a real run this project's own budget would
  // guarantee fails partway through.
  if (plan.executionPolicy === "workflow") {
    const budget = await resolveBudgetPolicy(plan.orgId, plan.projectId)
    if (budget.maxSteps != null && plan.estimatedCost.agentSteps != null && plan.estimatedCost.agentSteps > budget.maxSteps) {
      return { allowed: false, reason: `BUDGET_EXCEEDED — this action's estimated ${plan.estimatedCost.agentSteps} steps already exceeds the project's ${budget.maxSteps}-step budget ceiling.` }
    }
    if (budget.maxTokens != null && plan.estimatedCost.tokens != null && plan.estimatedCost.tokens > budget.maxTokens) {
      return { allowed: false, reason: `BUDGET_EXCEEDED — this action's estimated ${plan.estimatedCost.tokens} tokens already exceeds the project's ${budget.maxTokens}-token budget ceiling.` }
    }
  }

  return { allowed: true, reason: "Policy checks passed: decision approved and fresh, every required capability present, estimated cost within budget." }
}

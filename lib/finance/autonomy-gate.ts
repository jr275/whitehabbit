/* ================================================================== *
 * AUTONOMY GATING (§19) — connects Policy evaluation to the Worker's
 * autonomy level. Policy is NEVER bypassed by autonomy — a higher
 * level can only ever expand what gets PREPARED, never skip approval
 * a policy actually requires, and never causes a real external action
 * (nothing in this codebase can execute a payment or term change yet —
 * see ProposedAction.execution, always "NOT_EXECUTED" this phase, §20).
 * ================================================================== */

import type { AutonomyLevel } from "@/lib/workforce/catalog"
import type { PolicyEvaluationResult, ProposedAction } from "./types"

export interface AutonomyGateResult {
  action: ProposedAction
  /** Human-readable explanation of why the action landed at this
   * status — always references the real autonomy level and policy
   * result, never invented. */
  rationale: string
}

/** Finalizes a ProposedAction's status/approval given the Worker's
 * autonomy level and a real PolicyEvaluationResult. `draft` supplies
 * every field except status/approval/execution, which this function
 * alone decides. */
export function gateAction(draft: Omit<ProposedAction, "status" | "approval" | "execution">, autonomyLevel: AutonomyLevel, policy: PolicyEvaluationResult): AutonomyGateResult {
  // A policy BLOCKED verdict wins outright, at any autonomy level.
  if (policy.status === "BLOCKED") {
    return {
      action: { ...draft, status: "NOT_CONFIGURED", approval: "REQUIRED", execution: "NOT_EXECUTED" },
      rationale: `Blocked by policy: ${policy.reasons.join(" ")}`,
    }
  }

  if (autonomyLevel === "observe") {
    return {
      action: { ...draft, status: "NOT_CONFIGURED", approval: "REQUIRED", execution: "NOT_EXECUTED" },
      rationale: "Autonomy is Level 0 (Observe) — this worker only surfaces findings; it does not prepare actions.",
    }
  }

  if (autonomyLevel === "recommend") {
    return {
      action: { ...draft, status: "NOT_CONFIGURED", approval: "REQUIRED", execution: "NOT_EXECUTED" },
      rationale: "Autonomy is Level 1 (Recommend) — a recommendation is stated, but no action is prepared without a human first raising autonomy to Level 2+.",
    }
  }

  if (autonomyLevel === "prepare") {
    return {
      action: { ...draft, status: "PREPARED", approval: "REQUIRED", execution: "NOT_EXECUTED" },
      rationale: "Autonomy is Level 2 (Prepare) — the action is prepared for human review; execution always requires approval at this level.",
    }
  }

  // execute_within_policy (Level 3) and autonomous_optimization (Level
  // 4, not reachable by any Worker today — see AUTONOMY_LEVEL_META) are
  // gated identically: policy ALLOWED means no human approval is
  // required to consider the action ready, but nothing in this
  // codebase actually executes a financial action yet, so execution
  // stays NOT_EXECUTED regardless (§20, §39 — no real execution path
  // exists to call).
  const approvalRequired = policy.status === "APPROVAL_REQUIRED"
  return {
    action: { ...draft, status: approvalRequired ? "PREPARED" : "READY", approval: approvalRequired ? "REQUIRED" : "NOT_REQUIRED", execution: "NOT_EXECUTED" },
    rationale: approvalRequired
      ? `Autonomy allows execution within policy, but this action matched: ${policy.reasons.join(" ")}`
      : "Autonomy allows execution within policy and no policy requires approval — the action is ready, but this phase never executes a real financial action (no connector exists to call).",
  }
}

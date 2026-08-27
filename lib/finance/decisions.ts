/* ================================================================== *
 * DECISION GENERATION (§17) — when an Opportunity is mature (status
 * READY) and has passed through simulation + policy + autonomy
 * gating, this assembles the structured Decision object the /decisions
 * page and CFO test both read from.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import type { AutonomyGateResult } from "./autonomy-gate"
import type { Decision, Opportunity, PolicyEvaluationResult, ScenarioResult } from "./types"

export function generateDecision(opportunity: Opportunity, scenario: ScenarioResult, policy: PolicyEvaluationResult, gate: AutonomyGateResult, workerId: string, executionId?: string): Decision {
  const annualBenefit = Math.round(Math.abs(scenario.economicImpact))
  return {
    id: `dec_${randomUUID()}`,
    title: opportunity.title,
    problem: opportunity.description,
    evidence: opportunity.evidence,
    assumptions: opportunity.assumptions,
    alternatives: ["Take no action — leave the current position unchanged.", "Defer and re-evaluate at the next intelligence run."],
    scenario,
    economicImpact: { cashRelease: Math.round(Math.abs(scenario.cashImpact)), annualBenefit, currency: opportunity.currency },
    risk: opportunity.risk,
    recommendation: opportunity.recommendedAction,
    confidence: opportunity.confidence,
    policyStatus: policy.status,
    approvalStatus: gate.action.approval === "REQUIRED" ? "REQUIRED" : policy.status === "BLOCKED" ? "BLOCKED" : "NOT_REQUIRED",
    action: gate.action,
    status: gate.action.status === "READY" ? "READY" : gate.action.status === "PREPARED" ? "PREPARED" : "DETECTED",
    createdAt: Date.now(),
    workerId,
    executionId,
    opportunityId: opportunity.id,
  }
}

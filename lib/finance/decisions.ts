/* ================================================================== *
 * DECISION GENERATION (§17) — when an Opportunity is mature (status
 * READY) and has passed through simulation + policy + autonomy
 * gating, this assembles the structured Decision object the /decisions
 * page and CFO test both read from.
 *
 * Phase 4 §9/§11: "A Decision should be generated only when the engine
 * has enough evidence." evaluateDecisionReadiness() is that gate — a
 * pure, deterministic confidence check the orchestrating skill runs
 * BEFORE calling evaluatePolicy()/gateAction(), so an under-confident
 * opportunity still gets a real Decision object (visible, honest,
 * traceable) whose policyStatus is INSUFFICIENT_DATA rather than
 * silently being skipped.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import type { AutonomyGateResult } from "./autonomy-gate"
import type { Decision, Opportunity, PolicyEvaluationResult, ScenarioResult } from "./types"

/** DEMO ASSUMPTION: the minimum opportunity confidence this engine
 * requires before it will generate a Decision at all. Every category
 * this engine currently detects clears this bar in the real demo
 * dataset (§13's "3-7 high-quality opportunities") — this gate exists
 * for the real, lower-confidence opportunities a future signal/
 * category will inevitably produce, not as dead code. */
export const MIN_DECISION_CONFIDENCE = 55

/** Returns a real INSUFFICIENT_DATA policy result when the opportunity
 * hasn't cleared the confidence bar — null means "proceed to the real
 * evaluatePolicy() call", never a magic sentinel the caller has to
 * remember to check against a specific value. */
export function evaluateDecisionReadiness(opportunity: Opportunity, minConfidence: number = MIN_DECISION_CONFIDENCE): PolicyEvaluationResult | null {
  if (opportunity.confidence < minConfidence) {
    return {
      status: "INSUFFICIENT_DATA",
      matchedPolicies: [],
      reasons: [`Confidence ${opportunity.confidence}% is below the ${minConfidence}% minimum required to generate a decision.`],
    }
  }
  return null
}

/** Plain-language "what could go wrong" — always a real sentence,
 * never blank, derived only from the opportunity's own stated risk/
 * reversibility (never invented text unrelated to those facts). */
function describeDownside(opportunity: Opportunity): string {
  const parts: string[] = []
  if (opportunity.reversibility === "irreversible") parts.push("difficult or impossible to reverse if the assumption doesn't hold")
  else if (opportunity.reversibility === "hard_to_reverse") parts.push("hard to fully reverse once acted on")
  if (opportunity.risk === "high" || opportunity.risk === "critical") parts.push(`${opportunity.risk} execution risk`)
  else if (opportunity.risk === "medium") parts.push("moderate execution risk")
  if (parts.length === 0) return "Low — a reversible action with low execution risk."
  return `${parts.join("; ")}.`
}

export function generateDecision(opportunity: Opportunity, scenario: ScenarioResult, policy: PolicyEvaluationResult, gate: AutonomyGateResult, workerId: string, executionId?: string): Decision {
  const annualBenefit = Math.round(Math.abs(scenario.economicImpact))
  return {
    id: `dec_${randomUUID()}`,
    entityId: opportunity.entityId,
    skillId: opportunity.skillId,
    title: opportunity.title,
    problem: opportunity.description,
    evidence: opportunity.evidence,
    assumptions: opportunity.assumptions,
    alternatives: ["Take no action — leave the current position unchanged.", "Defer and re-evaluate at the next intelligence run."],
    scenario,
    economicImpact: { cashRelease: Math.round(Math.abs(scenario.cashImpact)), annualBenefit, currency: opportunity.currency },
    downside: describeDownside(opportunity),
    risk: opportunity.risk,
    recommendation: opportunity.recommendedAction,
    confidence: opportunity.confidence,
    policyStatus: policy.status,
    approvalStatus: gate.action.approval === "REQUIRED" ? "REQUIRED" : policy.status === "BLOCKED" ? "BLOCKED" : "NOT_REQUIRED",
    executionStatus: gate.action.execution,
    action: gate.action,
    status: gate.action.status === "READY" ? "READY" : gate.action.status === "PREPARED" ? "PREPARED" : "DETECTED",
    createdAt: Date.now(),
    dataProvenance: "demo",
    economicState: "estimated",
    workerId,
    executionId,
    opportunityId: opportunity.id,
  }
}

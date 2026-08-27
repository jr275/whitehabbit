/* ================================================================== *
 * OPPORTUNITY ECONOMICS (§12) — transparent, pure functions. No score
 * here is arbitrary: every number is derived from a stated formula an
 * evidence panel can show in full.
 * ================================================================== */

import type { OpportunityEconomics } from "./types"

/** Gross Economic Impact is just a labeled pass-through of the raw
 * dollar figure a scenario/opportunity computed — kept as its own
 * function so every caller states impact through one place. */
export function calculateEconomicImpact(rawValue: number): number {
  return round2(rawValue)
}

/** Expected Value = Gross Impact × Probability. `probability` is a
 * 0–1 fraction. */
export function calculateExpectedValue(grossImpact: number, probability: number): number {
  return round2(grossImpact * clamp01(probability))
}

/** Risk Adjustment — a negative dollar figure that discounts expected
 * value for execution/reversal risk. `riskPct` (0–1) is how much of
 * the expected value is put at risk by the given risk tier. */
export function calculateRiskAdjustment(expectedValue: number, riskPct: number): number {
  return round2(-Math.abs(expectedValue * clamp01(riskPct)))
}

/** Effort Adjustment — a negative dollar figure standing in for the
 * cost of doing the work (time, coordination), expressed as a flat
 * fraction of expected value by effort tier. */
export function calculateEffortAdjustment(expectedValue: number, effortPct: number): number {
  return round2(-Math.abs(expectedValue * clamp01(effortPct)))
}

/** Priority Value = Expected Value + Risk Adjustment + Effort
 * Adjustment — the single number the Opportunity Engine ranks by. */
export function calculatePriority(expectedValue: number, riskAdjustment: number, effortAdjustment: number): number {
  return round2(expectedValue + riskAdjustment + effortAdjustment)
}

const RISK_PCT: Record<"low" | "medium" | "high" | "critical", number> = { low: 0.05, medium: 0.12, high: 0.25, critical: 0.4 }
const EFFORT_PCT: Record<"low" | "medium" | "high", number> = { low: 0.03, medium: 0.08, high: 0.18 }

/** Assembles the full, transparent economics chain for one
 * opportunity in one call — the exact methodology the evidence panel
 * shows (§12 example: Gross -> Probability -> Expected -> Risk adj ->
 * Effort adj -> Priority). */
export function buildOpportunityEconomics(grossImpact: number, probability: number, risk: "low" | "medium" | "high" | "critical", effort: "low" | "medium" | "high"): OpportunityEconomics {
  const impact = calculateEconomicImpact(grossImpact)
  const expectedValue = calculateExpectedValue(impact, probability)
  const riskAdjustment = calculateRiskAdjustment(expectedValue, RISK_PCT[risk])
  const effortAdjustment = calculateEffortAdjustment(expectedValue, EFFORT_PCT[effort])
  const priorityValue = calculatePriority(expectedValue, riskAdjustment, effortAdjustment)
  return { grossImpact: impact, probability: clamp01(probability), expectedValue, riskAdjustment, effortAdjustment, priorityValue }
}

/* ================================================================== *
 * OPPORTUNITY PRIORITY SCORE (Phase 4 §8) — a separate, dimensionless
 * RANKING number, deliberately distinct from `economics.priorityValue`
 * (a real dollar figure). Conceptually:
 *
 *   Priority = Economic Impact × Probability × Urgency × Feasibility ×
 *              Reversibility, adjusted by Risk
 *
 * "Feasibility" is not a separate stored field — it is effort's own
 * inverse (low effort = high feasibility) — introducing a second field
 * that always moves opposite to `effort` would be a duplicate concept,
 * not a new one, so effort's inverse is used directly and is not also
 * applied as a second "effort adjustment" here (that discount already
 * lives in `economics.effortAdjustment`, which this score does not
 * touch). Purely for SORT ORDER — never shown to the user as a dollar
 * figure; the transparent economics chain above remains the number a
 * person actually reads.
 * ================================================================== */

const URGENCY_FACTOR: Record<"low" | "medium" | "high", number> = { low: 0.85, medium: 1.0, high: 1.15 }
const FEASIBILITY_FACTOR_BY_EFFORT: Record<"low" | "medium" | "high", number> = { low: 1.15, medium: 1.0, high: 0.8 }
const REVERSIBILITY_FACTOR: Record<"reversible" | "hard_to_reverse" | "irreversible", number> = { reversible: 1.1, hard_to_reverse: 1.0, irreversible: 0.85 }
const RISK_DAMPENING_FACTOR: Record<"low" | "medium" | "high" | "critical", number> = { low: 1.0, medium: 0.9, high: 0.75, critical: 0.55 }

export function calculateOpportunityPriorityScore(
  economicImpact: number,
  probability: number,
  urgency: "low" | "medium" | "high",
  effort: "low" | "medium" | "high",
  reversibility: "reversible" | "hard_to_reverse" | "irreversible",
  risk: "low" | "medium" | "high" | "critical",
): number {
  const score =
    Math.max(0, economicImpact) *
    clamp01(probability) *
    URGENCY_FACTOR[urgency] *
    FEASIBILITY_FACTOR_BY_EFFORT[effort] *
    REVERSIBILITY_FACTOR[reversibility] *
    RISK_DAMPENING_FACTOR[risk]
  return round2(score)
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

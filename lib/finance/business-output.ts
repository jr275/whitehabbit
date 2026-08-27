/* ================================================================== *
 * BUSINESS OUTPUT (§21) — the one summary a completed intelligence run
 * produces. Business/economic value first, technical metrics never
 * shown here at all (they live in the execution's own MetricEmissions).
 * ================================================================== */

import type { BusinessOutput, Decision, LiquiditySignal, Opportunity, SignalSeverity } from "./types"

const SEVERITY_RANK: Record<SignalSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 }

export function generateBusinessOutput(opportunities: Opportunity[], decisions: Decision[], signalsBefore: LiquiditySignal[], signalsAfter: LiquiditySignal[]): BusinessOutput {
  const cashReleasedPotential = Math.round(opportunities.reduce((s, o) => s + o.expectedValue, 0))
  const economicBenefitPotential = Math.round(decisions.reduce((s, d) => s + d.economicImpact.annualBenefit, 0))
  const preparedActions = decisions.filter((d) => d.action.status === "PREPARED" || d.action.status === "READY").length

  return {
    cashReleasedPotential,
    economicBenefitPotential,
    currency: "USD",
    liquidityRiskBefore: worstSeverity(signalsBefore),
    liquidityRiskAfter: worstSeverity(signalsAfter),
    opportunitiesCount: opportunities.length,
    recommendationsCount: decisions.length,
    actionsPreparedCount: preparedActions,
    label: "ESTIMATED",
    provenance: "demo",
  }
}

function worstSeverity(signals: LiquiditySignal[]): SignalSeverity | "none" {
  if (signals.length === 0) return "none"
  return signals.reduce((worst, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[worst] ? s.severity : worst), signals[0].severity)
}

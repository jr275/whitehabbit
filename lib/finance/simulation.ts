/* ================================================================== *
 * SIMULATION ENGINE (§16) — deterministic scenario comparison.
 * No Monte Carlo, no probabilistic optimization (§39) — this is the
 * transparent baseline-vs-scenario delta the brief asks for first.
 * ================================================================== */

import { calculateDPO, calculateDSO } from "./metrics"
import type { ScenarioChange, ScenarioResult } from "./types"

export interface ScenarioBaseline {
  label: string
  receivablesTotal: number
  payablesTotal: number
  annualCreditSales: number
  annualCOGS: number
  fundingDrawn: number
  fundingRatePct: number
  /** Cost of capital used to translate a one-time cash release into an
   * annualized economic benefit — a DEMO ASSUMPTION unless the caller
   * supplies a real, operator-defined rate. */
  costOfCapitalPct?: number
}

/** Runs one deterministic scenario against a baseline. Each `changes`
 * field is independent — only the ones provided are applied; anything
 * omitted keeps its baseline value. */
export function runScenario(baseline: ScenarioBaseline, changes: ScenarioChange, label: string): ScenarioResult {
  const costOfCapitalPct = baseline.costOfCapitalPct ?? 8 // DEMO ASSUMPTION: 8% cost of capital

  const currentDSO = calculateDSO(baseline.receivablesTotal, baseline.annualCreditSales).value ?? 0
  const currentDPO = calculateDPO(baseline.payablesTotal, baseline.annualCOGS).value ?? 0

  const targetDSO = changes.dsoTargetDays ?? currentDSO
  const targetDPO = changes.dpoTargetDays ?? currentDPO

  // Receivables release: shortening DSO by ΔDSO days frees up
  // (ΔDSO / 365) × annual credit sales in receivables that would
  // otherwise still be outstanding.
  const dsoDeltaDays = currentDSO - targetDSO
  const receivablesRelease = round2((dsoDeltaDays / 365) * baseline.annualCreditSales)

  // Payables release: extending DPO by ΔDPO days keeps that much cash
  // in-house longer — (ΔDPO / 365) × annual COGS.
  const dpoDeltaDays = targetDPO - currentDPO
  const payablesRelease = round2((dpoDeltaDays / 365) * baseline.annualCOGS)

  // Funding cost impact: a rate change applied to the currently drawn balance.
  const fundingRateDelta = changes.fundingRatePctDelta ?? 0
  const fundingCostImpact = round2(-(baseline.fundingDrawn * (fundingRateDelta / 100)))

  const cashAllocationImpact = round2(changes.cashAllocationChange ?? 0)

  const cashImpact = round2(receivablesRelease + payablesRelease + fundingCostImpact + cashAllocationImpact)
  const liquidityImpact = cashImpact // one-time cash-position effect
  const economicImpact = round2(cashImpact * (costOfCapitalPct / 100)) // annualized benefit of holding that cash longer

  return {
    label,
    baseline: { dso: currentDSO, dpo: currentDPO, fundingDrawn: baseline.fundingDrawn, fundingRatePct: baseline.fundingRatePct },
    scenario: { dso: targetDSO, dpo: targetDPO, fundingDrawn: baseline.fundingDrawn, fundingRatePct: baseline.fundingRatePct + fundingRateDelta },
    receivablesRelease,
    payablesRelease,
    cashImpact,
    liquidityImpact,
    economicImpact,
    kind: "SIMULATION",
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

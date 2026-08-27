/* ================================================================== *
 * LIQUIDITY RISK DETECTION (§9) — structured, confidence-scored
 * signals. Every signal cites its own evidence and never claims more
 * certainty than the data supports.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import type { CashConcentrationResult, CashProjectionResult, LiquiditySignal, ReceivableFact } from "./types"

export interface WorkingCapitalOpportunitySignal {
  metric: "DSO" | "DPO"
  currentDays: number
  targetDays: number
  deltaDays: number
  direction: "reduce" | "extend"
}

/** Detects whether a working-capital opportunity exists on DSO or DPO
 * — a pure threshold/delta calculation, deliberately separate from the
 * dollar-economics the Opportunity Engine (opportunities.ts) builds on
 * top of it, so the detection logic itself is independently testable
 * (§32). Returns null when the metric is already at or better than
 * target — no opportunity to report is a real, valid result. */
export function detectWorkingCapitalOpportunity(metric: "DSO" | "DPO", currentDays: number | null, targetDays: number): WorkingCapitalOpportunitySignal | null {
  if (currentDays === null) return null
  if (metric === "DSO") {
    if (currentDays <= targetDays) return null
    return { metric, currentDays, targetDays, deltaDays: round2(currentDays - targetDays), direction: "reduce" }
  }
  // DPO: an opportunity exists when the company pays FASTER than the target (room to extend terms).
  if (currentDays >= targetDays) return null
  return { metric, currentDays, targetDays, deltaDays: round2(targetDays - currentDays), direction: "extend" }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Detects a projected liquidity shortfall from a real 13-week
 * projection — severity and confidence both computed, never picked. */
export function detectLiquidityRisk(projection: CashProjectionResult): LiquiditySignal | null {
  const worst = projection.worstWeek
  if (!worst || worst.potentialShortfall <= 0) return null

  const severity = worst.potentialShortfall > worst.minimumLiquidityRequirement ? "high" : worst.potentialShortfall > worst.minimumLiquidityRequirement * 0.5 ? "medium" : "low"
  // Confidence is higher for a near-term week (more of its inflow/
  // outflow is from known, dated receivables/payables rather than the
  // baseline average) and decays for weeks further out in the horizon.
  const weeksOut = worst.weekNumber
  const confidence = Math.max(50, Math.round(95 - weeksOut * 3))

  return {
    id: `sig_${randomUUID()}`,
    type: "liquidity_shortfall",
    severity,
    projectedMinimumCash: worst.availableCash,
    requiredMinimum: worst.minimumLiquidityRequirement,
    potentialShortfall: worst.potentialShortfall,
    expectedDate: worst.weekStart,
    confidence,
    evidence: [
      `Week ${worst.weekNumber} (${worst.weekStart}) projects available cash of ${worst.availableCash.toLocaleString()} against a minimum requirement of ${worst.minimumLiquidityRequirement.toLocaleString()}.`,
      `Known supplier payments committed that week: ${worst.committed.toLocaleString()}.`,
    ],
  }
}

/** Detects concentration risk in cash holdings (one account/bank
 * holding an outsized share) — a real signal, not a generic warning. */
export function detectCashConcentrationRisk(concentration: CashConcentrationResult, thresholdPct = 60): LiquiditySignal | null {
  if (concentration.maxConcentrationPct < thresholdPct) return null
  const top = concentration.byAccount[0]
  const severity = concentration.maxConcentrationPct >= 80 ? "high" : "medium"
  return {
    id: `sig_${randomUUID()}`,
    type: "concentration_risk",
    severity,
    confidence: 95, // structural fact about the current balances, not a projection
    evidence: [`${top.key} holds ${concentration.maxConcentrationPct}% of total cash (${top.amount.toLocaleString()} of ${concentration.total.toLocaleString()}).`],
  }
}

/** Detects receivables concentration — a small number of customers
 * responsible for an outsized share of what's owed. */
export function detectReceivablesConcentrationRisk(receivables: ReceivableFact[], thresholdPct = 40): LiquiditySignal | null {
  const total = receivables.reduce((s, r) => s + r.amount, 0)
  if (total <= 0) return null
  const byCustomer = new Map<string, number>()
  for (const r of receivables) byCustomer.set(r.customer, (byCustomer.get(r.customer) ?? 0) + r.amount)
  const top2 = Array.from(byCustomer.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
  const top2Pct = Math.round((top2.reduce((s, [, amt]) => s + amt, 0) / total) * 1000) / 10
  if (top2Pct < thresholdPct) return null
  return {
    id: `sig_${randomUUID()}`,
    type: "receivables_concentration",
    severity: top2Pct >= 60 ? "high" : "medium",
    confidence: 92,
    evidence: [`Top 2 customers (${top2.map(([c]) => c).join(", ")}) represent ${top2Pct}% of total open receivables (${total.toLocaleString()}).`],
  }
}

/** Detects dependency on a drawn funding facility relative to its
 * limit — a structural risk, not a projection. */
export function detectFundingDependency(drawn: number, limit: number, thresholdPct = 50): LiquiditySignal | null {
  if (limit <= 0) return null
  const drawnPct = Math.round((drawn / limit) * 1000) / 10
  if (drawnPct < thresholdPct) return null
  return {
    id: `sig_${randomUUID()}`,
    type: "funding_dependency",
    severity: drawnPct >= 80 ? "high" : "medium",
    confidence: 95,
    evidence: [`${drawnPct}% of the available funding facility is currently drawn (${drawn.toLocaleString()} of ${limit.toLocaleString()}).`],
  }
}

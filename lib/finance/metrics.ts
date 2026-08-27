/* ================================================================== *
 * DERIVED FINANCIAL METRICS — pure, deterministic calculations (§7).
 *
 * Every function here takes plain numbers/facts and returns a plain
 * result — no I/O, no randomness, no LLM call. Given identical inputs
 * they always return identical outputs (§33). Division-by-zero and
 * missing-data cases return `null` (with a `reason`), never a
 * fabricated 0 standing in for "could not compute" (§32).
 * ================================================================== */

import type { BankAccountFact, CashConcentrationResult, IdleCashResult, LiquidityCoverageResult, MetricResult, WorkingCapitalResult } from "./types"

/** Days Sales Outstanding — how long, on average, receivables take to
 * collect. Standard formula: (Receivables / Annual Credit Sales) × 365. */
export function calculateDSO(receivablesTotal: number, annualCreditSales: number, daysInPeriod = 365): MetricResult {
  if (annualCreditSales <= 0) return { value: null, reason: "Annual credit sales is zero or negative — DSO is undefined." }
  if (receivablesTotal < 0) return { value: null, reason: "Receivables total is negative — not a valid input." }
  return { value: round2((receivablesTotal / annualCreditSales) * daysInPeriod) }
}

/** Days Payable Outstanding — how long, on average, the company takes
 * to pay suppliers. (Payables / Annual COGS) × 365. */
export function calculateDPO(payablesTotal: number, annualCOGS: number, daysInPeriod = 365): MetricResult {
  if (annualCOGS <= 0) return { value: null, reason: "Annual COGS is zero or negative — DPO is undefined." }
  if (payablesTotal < 0) return { value: null, reason: "Payables total is negative — not a valid input." }
  return { value: round2((payablesTotal / annualCOGS) * daysInPeriod) }
}

/** Days Inventory Outstanding — how long inventory sits before sale.
 * (Inventory / Annual COGS) × 365. */
export function calculateDIO(inventoryValue: number, annualCOGS: number, daysInPeriod = 365): MetricResult {
  if (annualCOGS <= 0) return { value: null, reason: "Annual COGS is zero or negative — DIO is undefined." }
  if (inventoryValue < 0) return { value: null, reason: "Inventory value is negative — not a valid input." }
  return { value: round2((inventoryValue / annualCOGS) * daysInPeriod) }
}

/** Cash Conversion Cycle — DIO + DSO − DPO. Undefined (null) if any
 * of its three inputs is undefined — never silently substitutes 0 for
 * a missing component, which would understate the real cycle. */
export function calculateCCC(dio: MetricResult, dso: MetricResult, dpo: MetricResult): MetricResult {
  if (dio.value === null || dso.value === null || dpo.value === null) {
    return { value: null, reason: "CCC requires DIO, DSO, and DPO to all be computable." }
  }
  return { value: round2(dio.value + dso.value - dpo.value) }
}

/** Working Capital = current assets (cash + receivables + inventory)
 * − current liabilities (payables). A negative result is a REAL,
 * valid finding (a working-capital deficit), not an error. */
export function calculateWorkingCapital(cash: number, receivables: number, inventory: number, payables: number): WorkingCapitalResult {
  const currentAssets = cash + receivables + inventory
  const currentLiabilities = payables
  return { currentAssets, currentLiabilities, workingCapital: round2(currentAssets - currentLiabilities) }
}

/** Liquidity Coverage — available cash against a stated minimum
 * requirement. `coverageRatio` is null when the requirement is 0
 * (undefined ratio), never a fabricated Infinity. */
export function calculateLiquidityCoverage(availableCash: number, minimumRequirement: number): LiquidityCoverageResult {
  const coverageRatio = minimumRequirement > 0 ? round2(availableCash / minimumRequirement) : null
  return { availableCash, minimumRequirement, coverageRatio, buffer: round2(availableCash - minimumRequirement) }
}

/** Funding Requirement — how much new funding would be needed to keep
 * the projected minimum cash at or above the required minimum. Zero
 * (not negative) when the projection already covers the requirement —
 * a shortfall of $0 is the honest "no funding needed" case. */
export function calculateFundingRequirement(projectedMinimumCash: number, minimumRequirement: number): { projectedMinimumCash: number; minimumRequirement: number; fundingRequired: number } {
  const fundingRequired = Math.max(0, round2(minimumRequirement - projectedMinimumCash))
  return { projectedMinimumCash, minimumRequirement, fundingRequired }
}

/** Idle Cash — reserve-type balances earning below a stated yield
 * threshold. Never flags an operating/payroll account as "idle" —
 * those exist to move, not to earn yield. */
export function calculateIdleCash(accounts: BankAccountFact[], minYieldThresholdPct = 0.5): IdleCashResult {
  const idle = accounts.filter((a) => a.accountType === "reserve" && a.yieldPct < minYieldThresholdPct)
  return {
    idleAccounts: idle.map((a) => ({ accountId: a.id, bank: a.bank, balance: a.balance, yieldPct: a.yieldPct })),
    totalIdle: round2(idle.reduce((s, a) => s + a.balance, 0)),
  }
}

/** Cash Concentration — what share of total cash sits in the single
 * largest account. A concentration RISK signal (see signals.ts) keys
 * off `maxConcentrationPct`, never off account count alone. */
export function calculateCashConcentration(accounts: BankAccountFact[]): CashConcentrationResult {
  const total = accounts.reduce((s, a) => s + a.balance, 0)
  const byAccount = accounts
    .map((a) => ({ key: `${a.bank} — ${a.accountType}`, amount: a.balance, pct: total > 0 ? round1((a.balance / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { total: round2(total), byAccount, maxConcentrationPct: byAccount[0]?.pct ?? 0 }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

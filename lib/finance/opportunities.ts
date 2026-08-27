/* ================================================================== *
 * OPPORTUNITY ENGINE (§11–14) — consumes financial facts + derived
 * metrics + signals + assumptions, and produces 3–7 real, evidenced
 * Opportunity objects. Deliberately narrow: quality over count (§13).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { buildOpportunityEconomics } from "./economics"
import { calculateDPO, calculateDSO, calculateIdleCash } from "./metrics"
import { detectWorkingCapitalOpportunity } from "./signals"
import type { BankAccountFact, FundingFacilityFact, Opportunity, PayableFact, ReceivableFact } from "./types"

export interface OpportunityContext {
  workerId: string
  executionId?: string
  bankAccounts: BankAccountFact[]
  receivables: ReceivableFact[]
  payables: PayableFact[]
  fundingFacilities: FundingFacilityFact[]
  annualCreditSales: number
  annualCOGS: number
  /** DEMO ASSUMPTION target DSO — see EconomicObjective if the worker
   * stated one; otherwise a stated internal demo assumption. */
  targetDSODays: number
  targetDPODays: number
  minReserveYieldPct: number
}

export function buildOpportunities(ctx: OpportunityContext): Opportunity[] {
  const opportunities: Opportunity[] = []

  const receivablesTotal = ctx.receivables.filter((r) => r.status !== "paid").reduce((s, r) => s + r.amount, 0)
  const payablesTotal = ctx.payables.reduce((s, p) => s + p.amount, 0)
  const currentDSO = calculateDSO(receivablesTotal, ctx.annualCreditSales).value
  const currentDPO = calculateDPO(payablesTotal, ctx.annualCOGS).value

  /* ---- 1. Early-payment discount capture ---- */
  const discountable = ctx.payables.filter((p) => p.earlyPayDiscountPct > 0)
  if (discountable.length > 0) {
    const grossImpact = discountable.reduce((s, p) => s + p.amount * (p.earlyPayDiscountPct / 100), 0)
    const economics = buildOpportunityEconomics(grossImpact, 0.9, "low", "low")
    opportunities.push({
      id: `opp_${randomUUID()}`,
      category: "early_payment_discount",
      title: "Capture uncaptured early-payment discounts",
      description: `${discountable.length} open payable${discountable.length === 1 ? "" : "s"} to ${Array.from(new Set(discountable.map((p) => p.supplier))).join(", ")} offer an early-payment discount that is not currently being taken.`,
      estimatedValue: economics.grossImpact,
      currency: "USD",
      probability: economics.probability,
      expectedValue: economics.expectedValue,
      urgency: "medium",
      effort: "low",
      risk: "low",
      reversibility: "reversible",
      confidence: 90,
      evidence: discountable.map((p) => ({ label: p.supplier, value: `${p.amount.toLocaleString()} due ${p.dueDate}, ${p.earlyPayDiscountPct}% discount within ${p.earlyPayWindowDays} days` })),
      assumptions: [{ label: "Payment capacity", value: "Assumes available cash to pay within the discount window", kind: "demo_assumption" }],
      recommendedAction: "Prepare early payment for the discountable invoices within their discount windows.",
      economics,
      status: "READY",
      createdAt: Date.now(),
      workerId: ctx.workerId,
      executionId: ctx.executionId,
    })
  }

  /* ---- 2. Idle cash reallocation ---- */
  const idle = calculateIdleCash(ctx.bankAccounts, ctx.minReserveYieldPct)
  if (idle.totalIdle > 0) {
    // Gross impact: the extra yield captured by moving idle cash from
    // its current (low) yield to the operating account's yield.
    const bestYield = Math.max(...ctx.bankAccounts.map((a) => a.yieldPct), 0)
    const avgIdleYield = idle.idleAccounts.reduce((s, a) => s + a.yieldPct, 0) / idle.idleAccounts.length
    const grossImpact = idle.totalIdle * ((bestYield - avgIdleYield) / 100)
    const economics = buildOpportunityEconomics(grossImpact, 0.75, "low", "low")
    opportunities.push({
      id: `opp_${randomUUID()}`,
      category: "idle_cash",
      title: "Reallocate idle reserve cash to a higher-yield account",
      description: `${idle.idleAccounts.length} reserve account${idle.idleAccounts.length === 1 ? "" : "s"} hold ${idle.totalIdle.toLocaleString()} at below-market yield.`,
      estimatedValue: economics.grossImpact,
      currency: "USD",
      probability: economics.probability,
      expectedValue: economics.expectedValue,
      urgency: "low",
      effort: "low",
      risk: "low",
      reversibility: "reversible",
      confidence: 78,
      evidence: idle.idleAccounts.map((a) => ({ label: a.bank, value: `${a.balance.toLocaleString()} at ${a.yieldPct}% yield` })),
      assumptions: [{ label: "Available higher-yield option", value: `Best currently observed yield: ${bestYield}%`, kind: "demo_assumption" }],
      recommendedAction: "Prepare a reallocation of idle reserve balances to a higher-yield account, subject to liquidity buffer requirements.",
      economics,
      status: "READY",
      createdAt: Date.now(),
      workerId: ctx.workerId,
      executionId: ctx.executionId,
    })
  }

  /* ---- 3. Receivables acceleration (DSO) ---- */
  const dsoSignal = detectWorkingCapitalOpportunity("DSO", currentDSO, ctx.targetDSODays)
  if (dsoSignal && currentDSO !== null) {
    const dsoDelta = dsoSignal.deltaDays
    const grossImpact = (dsoDelta / 365) * ctx.annualCreditSales
    const economics = buildOpportunityEconomics(grossImpact, 0.65, "medium", "medium")
    opportunities.push({
      id: `opp_${randomUUID()}`,
      category: "receivables_acceleration",
      title: "Accelerate receivables collection",
      description: `Days Sales Outstanding is ${currentDSO} days, above the ${ctx.targetDSODays}-day target — collecting faster would release cash currently tied up in receivables.`,
      estimatedValue: economics.grossImpact,
      currency: "USD",
      probability: economics.probability,
      expectedValue: economics.expectedValue,
      urgency: "medium",
      effort: "medium",
      risk: "medium",
      reversibility: "hard_to_reverse",
      confidence: 72,
      evidence: [
        { label: "Current DSO", value: `${currentDSO} days` },
        { label: "Open receivables", value: receivablesTotal.toLocaleString() },
        { label: "Overdue invoices", value: String(ctx.receivables.filter((r) => r.status === "overdue").length) },
      ],
      assumptions: [{ label: "Target DSO", value: `${ctx.targetDSODays} days`, kind: "demo_assumption" }],
      recommendedAction: "Prepare a collections push on overdue and near-due invoices; consider tightening terms for slow-paying customers.",
      economics,
      status: "READY",
      createdAt: Date.now(),
      workerId: ctx.workerId,
      executionId: ctx.executionId,
    })
  }

  /* ---- 4. Supplier payment-term extension (DPO) ---- */
  const dpoSignal = detectWorkingCapitalOpportunity("DPO", currentDPO, ctx.targetDPODays)
  if (dpoSignal && currentDPO !== null) {
    const dpoDelta = dpoSignal.deltaDays
    const grossImpact = (dpoDelta / 365) * ctx.annualCOGS
    const economics = buildOpportunityEconomics(grossImpact, 0.55, "medium", "medium")
    opportunities.push({
      id: `opp_${randomUUID()}`,
      category: "supplier_payment_terms",
      title: "Negotiate longer supplier payment terms",
      description: `Days Payable Outstanding is ${currentDPO} days, below the ${ctx.targetDPODays}-day target — extending terms with suppliers would keep cash in-house longer.`,
      estimatedValue: economics.grossImpact,
      currency: "USD",
      probability: economics.probability,
      expectedValue: economics.expectedValue,
      urgency: "low",
      effort: "high",
      risk: "medium",
      reversibility: "hard_to_reverse",
      confidence: 60,
      evidence: [
        { label: "Current DPO", value: `${currentDPO} days` },
        { label: "Open payables", value: payablesTotal.toLocaleString() },
      ],
      assumptions: [{ label: "Target DPO", value: `${ctx.targetDPODays} days`, kind: "demo_assumption" }, { label: "Supplier acceptance", value: "Assumes suppliers agree to extended terms without a price concession", kind: "demo_assumption" }],
      recommendedAction: "Prepare supplier renegotiation of payment terms from current to target.",
      economics,
      status: "READY",
      createdAt: Date.now(),
      workerId: ctx.workerId,
      executionId: ctx.executionId,
    })
  }

  /* ---- 5. Funding optimization ---- */
  for (const facility of ctx.fundingFacilities) {
    const bestReserveYield = Math.max(...ctx.bankAccounts.filter((a) => a.accountType === "reserve").map((a) => a.yieldPct), 0)
    if (facility.drawn > 0 && facility.ratePct > bestReserveYield) {
      // Paying down drawn balance avoids interest at facility.ratePct on
      // the portion that idle cash could otherwise cover.
      const idle = calculateIdleCash(ctx.bankAccounts, ctx.minReserveYieldPct + 5) // treat all reserve cash as a real repayment source here
      const payableDown = Math.min(idle.totalIdle, facility.drawn)
      if (payableDown <= 0) continue
      const grossImpact = payableDown * (facility.ratePct / 100)
      const economics = buildOpportunityEconomics(grossImpact, 0.7, "low", "low")
      opportunities.push({
        id: `opp_${randomUUID()}`,
        category: "funding_optimization",
        title: `Pay down drawn balance on ${facility.facility}`,
        description: `${facility.facility} carries a ${facility.ratePct}% rate on ${facility.drawn.toLocaleString()} drawn — idle reserve cash earning less than that rate could pay it down.`,
        estimatedValue: economics.grossImpact,
        currency: facility.currency,
        probability: economics.probability,
        expectedValue: economics.expectedValue,
        urgency: "low",
        effort: "low",
        risk: "low",
        reversibility: "reversible",
        confidence: 80,
        evidence: [
          { label: "Facility", value: `${facility.facility} — limit ${facility.limit.toLocaleString()}, drawn ${facility.drawn.toLocaleString()}, rate ${facility.ratePct}%` },
          { label: "Available idle reserve cash", value: idle.totalIdle.toLocaleString() },
        ],
        assumptions: [{ label: "Repayment amount", value: `Limited to the lesser of idle reserve cash and drawn balance: ${payableDown.toLocaleString()}`, kind: "demo_assumption" }],
        recommendedAction: `Prepare a paydown of ${payableDown.toLocaleString()} against the facility's drawn balance.`,
        economics,
        status: "READY",
        createdAt: Date.now(),
        workerId: ctx.workerId,
        executionId: ctx.executionId,
      })
    }
  }

  return opportunities.sort((a, b) => b.economics.priorityValue - a.economics.priorityValue)
}

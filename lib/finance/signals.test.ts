import { describe, expect, it } from "vitest"
import { calculateCashConcentration } from "./metrics"
import { detectCashConcentrationRisk, detectFundingDependency, detectLiquidityRisk, detectReceivablesConcentrationRisk, detectWorkingCapitalOpportunity } from "./signals"
import type { BankAccountFact, CashProjectionResult, ReceivableFact } from "./types"

function account(overrides: Partial<BankAccountFact> = {}): BankAccountFact {
  return { id: "a", entityId: "ent_usa", bank: "Bank", accountType: "operating", balance: 100, yieldPct: 1, currency: "USD", source: "demo", sourceType: "bank_account", asOf: "2026-08-24", dataProvenance: "demo", ...overrides }
}

describe("detectLiquidityRisk", () => {
  it("returns null when there is no shortfall week", () => {
    const projection: CashProjectionResult = { label: "BASELINE FORECAST", horizonWeeks: 1, openingCash: 100, minimumMinCash: 10, weeks: [{ weekNumber: 1, weekStart: "2026-08-24", opening: 100, inflows: 0, outflows: 0, closing: 100, committed: 0, availableCash: 100, minimumLiquidityRequirement: 10, liquidityBuffer: 90, potentialShortfall: 0 }], worstWeek: null }
    expect(detectLiquidityRisk(projection)).toBeNull()
  })

  it("returns a signal with evidence when a shortfall exists", () => {
    const week = { weekNumber: 2, weekStart: "2026-09-01", opening: 0, inflows: 0, outflows: 500, closing: -500, committed: 500, availableCash: -500, minimumLiquidityRequirement: 100, liquidityBuffer: -600, potentialShortfall: 600 }
    const projection: CashProjectionResult = { label: "BASELINE FORECAST", horizonWeeks: 2, openingCash: 0, minimumMinCash: 100, weeks: [week], worstWeek: week }
    const signal = detectLiquidityRisk(projection)
    expect(signal).not.toBeNull()
    expect(signal!.severity).toBe("high")
    expect(signal!.evidence.length).toBeGreaterThan(0)
    expect(signal!.confidence).toBeGreaterThan(0)
  })
})

describe("detectCashConcentrationRisk", () => {
  it("returns null below threshold", () => {
    const c = calculateCashConcentration([account({ id: "a", balance: 500 }), account({ id: "b", balance: 500 })])
    expect(detectCashConcentrationRisk(c, 60)).toBeNull()
  })
  it("flags high concentration", () => {
    const c = calculateCashConcentration([account({ id: "a", balance: 900 }), account({ id: "b", balance: 100 })])
    const s = detectCashConcentrationRisk(c, 60)
    expect(s?.severity).toBe("high")
  })
})

describe("detectReceivablesConcentrationRisk", () => {
  function receivable(customer: string, amount: number): ReceivableFact {
    return { id: `r_${customer}`, entityId: "ent_usa", customerId: customer, customer, invoiceId: `r_${customer}`, amount, issuedDate: "2026-08-01", dueDate: "2026-09-01", status: "current", currency: "USD", source: "demo", sourceType: "receivable", asOf: "2026-08-24", dataProvenance: "demo" }
  }
  it("returns null for zero receivables", () => {
    expect(detectReceivablesConcentrationRisk([])).toBeNull()
  })
  it("flags top-2 concentration above threshold", () => {
    const s = detectReceivablesConcentrationRisk([receivable("A", 700), receivable("B", 100), receivable("C", 200)], 40)
    expect(s).not.toBeNull()
  })
})

describe("detectFundingDependency", () => {
  it("returns null when drawn is below threshold", () => {
    expect(detectFundingDependency(100_000, 1_000_000, 50)).toBeNull()
  })
  it("returns null when limit is zero", () => {
    expect(detectFundingDependency(0, 0)).toBeNull()
  })
  it("flags high dependency", () => {
    const s = detectFundingDependency(900_000, 1_000_000, 50)
    expect(s?.severity).toBe("high")
  })
})

describe("detectWorkingCapitalOpportunity", () => {
  it("returns null for DSO already at or below target", () => {
    expect(detectWorkingCapitalOpportunity("DSO", 35, 40)).toBeNull()
  })
  it("flags DSO above target as an opportunity to reduce", () => {
    const s = detectWorkingCapitalOpportunity("DSO", 47, 40)
    expect(s?.direction).toBe("reduce")
    expect(s?.deltaDays).toBe(7)
  })
  it("returns null for DPO already at or above target", () => {
    expect(detectWorkingCapitalOpportunity("DPO", 45, 40)).toBeNull()
  })
  it("flags DPO below target as an opportunity to extend", () => {
    const s = detectWorkingCapitalOpportunity("DPO", 31, 45)
    expect(s?.direction).toBe("extend")
    expect(s?.deltaDays).toBe(14)
  })
  it("returns null when current value is null (missing data)", () => {
    expect(detectWorkingCapitalOpportunity("DSO", null, 40)).toBeNull()
  })
})

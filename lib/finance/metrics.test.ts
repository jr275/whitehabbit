import { describe, expect, it } from "vitest"
import {
  calculateCCC,
  calculateCashConcentration,
  calculateDIO,
  calculateDPO,
  calculateDSO,
  calculateFundingRequirement,
  calculateIdleCash,
  calculateLiquidityCoverage,
  calculateWorkingCapital,
} from "./metrics"
import type { BankAccountFact } from "./types"

function account(overrides: Partial<BankAccountFact> = {}): BankAccountFact {
  return {
    id: "acct_1",
    entityId: "ent_usa",
    bank: "Test Bank",
    accountType: "operating",
    balance: 100_000,
    yieldPct: 1,
    currency: "USD",
    source: "demo",
    sourceType: "bank_account",
    asOf: "2026-08-24",
    dataProvenance: "demo",
    ...overrides,
  }
}

describe("calculateDSO", () => {
  it("computes the normal case", () => {
    expect(calculateDSO(1_340_000, 10_400_000).value).toBeCloseTo(47.03, 1)
  })
  it("returns null when annual credit sales is zero", () => {
    const r = calculateDSO(1000, 0)
    expect(r.value).toBeNull()
    expect(r.reason).toBeTruthy()
  })
  it("returns null when annual credit sales is negative", () => {
    expect(calculateDSO(1000, -500).value).toBeNull()
  })
  it("returns null for negative receivables", () => {
    expect(calculateDSO(-100, 10_000).value).toBeNull()
  })
  it("returns 0 for zero receivables", () => {
    expect(calculateDSO(0, 10_000).value).toBe(0)
  })
})

describe("calculateDPO", () => {
  it("computes the normal case", () => {
    expect(calculateDPO(560_000, 6_600_000).value).toBeCloseTo(30.98, 1)
  })
  it("returns null when COGS is zero", () => {
    expect(calculateDPO(1000, 0).value).toBeNull()
  })
  it("returns null for negative payables", () => {
    expect(calculateDPO(-1, 1000).value).toBeNull()
  })
})

describe("calculateDIO", () => {
  it("computes the normal case", () => {
    expect(calculateDIO(450_000, 6_600_000).value).toBeCloseTo(24.9, 1)
  })
  it("returns null when COGS is zero", () => {
    expect(calculateDIO(1000, 0).value).toBeNull()
  })
})

describe("calculateCCC", () => {
  it("sums DIO + DSO - DPO", () => {
    const dio = { value: 25 }
    const dso = { value: 47 }
    const dpo = { value: 31 }
    expect(calculateCCC(dio, dso, dpo).value).toBe(41)
  })
  it("returns null if any component is null", () => {
    expect(calculateCCC({ value: null }, { value: 47 }, { value: 31 }).value).toBeNull()
    expect(calculateCCC({ value: 25 }, { value: null }, { value: 31 }).value).toBeNull()
    expect(calculateCCC({ value: 25 }, { value: 47 }, { value: null }).value).toBeNull()
  })
})

describe("calculateWorkingCapital", () => {
  it("computes current assets minus current liabilities", () => {
    const r = calculateWorkingCapital(500_000, 1_340_000, 450_000, 560_000)
    expect(r.currentAssets).toBe(2_290_000)
    expect(r.currentLiabilities).toBe(560_000)
    expect(r.workingCapital).toBe(1_730_000)
  })
  it("allows a negative working capital as a real result", () => {
    const r = calculateWorkingCapital(0, 0, 0, 100_000)
    expect(r.workingCapital).toBe(-100_000)
  })
})

describe("calculateLiquidityCoverage", () => {
  it("computes a coverage ratio and buffer", () => {
    const r = calculateLiquidityCoverage(300_000, 200_000)
    expect(r.coverageRatio).toBe(1.5)
    expect(r.buffer).toBe(100_000)
  })
  it("returns null coverageRatio when requirement is zero", () => {
    const r = calculateLiquidityCoverage(300_000, 0)
    expect(r.coverageRatio).toBeNull()
  })
  it("reports a negative buffer as a real shortfall", () => {
    const r = calculateLiquidityCoverage(100_000, 200_000)
    expect(r.buffer).toBe(-100_000)
  })
})

describe("calculateFundingRequirement", () => {
  it("returns 0 when the projection already covers the minimum", () => {
    expect(calculateFundingRequirement(300_000, 200_000).fundingRequired).toBe(0)
  })
  it("returns the real gap when projection falls short", () => {
    expect(calculateFundingRequirement(150_000, 200_000).fundingRequired).toBe(50_000)
  })
})

describe("calculateIdleCash", () => {
  it("flags only reserve accounts below the yield threshold", () => {
    const accounts = [account({ id: "a", accountType: "reserve", balance: 100, yieldPct: 0.1 }), account({ id: "b", accountType: "operating", balance: 999, yieldPct: 0.1 }), account({ id: "c", accountType: "reserve", balance: 200, yieldPct: 5 })]
    const r = calculateIdleCash(accounts, 0.5)
    expect(r.idleAccounts.map((a) => a.accountId)).toEqual(["a"])
    expect(r.totalIdle).toBe(100)
  })
  it("returns zero idle cash when there are no accounts", () => {
    expect(calculateIdleCash([], 0.5).totalIdle).toBe(0)
  })
})

describe("calculateCashConcentration", () => {
  it("computes percentage share per account", () => {
    const accounts = [account({ id: "a", balance: 800 }), account({ id: "b", balance: 200 })]
    const r = calculateCashConcentration(accounts)
    expect(r.total).toBe(1000)
    expect(r.maxConcentrationPct).toBe(80)
  })
  it("handles zero total cash without dividing by zero", () => {
    const r = calculateCashConcentration([account({ balance: 0 })])
    expect(r.maxConcentrationPct).toBe(0)
  })
})

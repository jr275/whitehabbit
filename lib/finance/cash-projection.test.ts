import { describe, expect, it } from "vitest"
import { projectCashPosition13Weeks } from "./cash-projection"
import type { CashWeekFact, PayableFact, ReceivableFact } from "./types"

const history: CashWeekFact[] = [
  { weekStart: "2026-07-27", inflow: 200_000, outflow: 180_000, netChange: 20_000, endingBalance: 1_000_000 },
  { weekStart: "2026-08-03", inflow: 210_000, outflow: 190_000, netChange: 20_000, endingBalance: 1_020_000 },
  { weekStart: "2026-08-10", inflow: 190_000, outflow: 200_000, netChange: -10_000, endingBalance: 1_010_000 },
  { weekStart: "2026-08-17", inflow: 205_000, outflow: 195_000, netChange: 10_000, endingBalance: 1_020_000 },
]

function receivable(overrides: Partial<ReceivableFact> = {}): ReceivableFact {
  return {
    id: "r1",
    entityId: "ent_usa",
    customerId: "cust_1",
    customer: "Test Customer",
    invoiceId: "r1",
    amount: 100_000,
    issuedDate: "2026-08-01",
    dueDate: "2026-09-01",
    status: "current",
    currency: "USD",
    source: "demo",
    sourceType: "receivable",
    asOf: "2026-08-24",
    dataProvenance: "demo",
    ...overrides,
  }
}
function payable(overrides: Partial<PayableFact> = {}): PayableFact {
  return {
    id: "p1",
    entityId: "ent_usa",
    supplierId: "sup_1",
    supplier: "Test Supplier",
    invoiceId: "p1",
    amount: 300_000,
    issuedDate: "2026-08-01",
    dueDate: "2026-09-10",
    paymentTermsDays: 30,
    earlyPayDiscountPct: 0,
    earlyPayWindowDays: 0,
    currency: "USD",
    source: "demo",
    sourceType: "payable",
    asOf: "2026-08-24",
    dataProvenance: "demo",
    ...overrides,
  }
}

describe("projectCashPosition13Weeks", () => {
  it("produces exactly 13 weeks by default", () => {
    const r = projectCashPosition13Weeks({ asOfDate: "2026-08-24", openingCash: 1_000_000, history, receivables: [], payables: [] })
    expect(r.weeks).toHaveLength(13)
    expect(r.label).toBe("BASELINE FORECAST")
  })

  it("carries opening -> closing across weeks correctly", () => {
    const r = projectCashPosition13Weeks({ asOfDate: "2026-08-24", openingCash: 500_000, history, receivables: [], payables: [] })
    expect(r.weeks[0].opening).toBe(500_000)
    expect(r.weeks[1].opening).toBe(r.weeks[0].closing)
  })

  it("places a known payable's amount into the week it falls due", () => {
    const r = projectCashPosition13Weeks({ asOfDate: "2026-08-24", openingCash: 1_000_000, history, receivables: [], payables: [payable({ dueDate: "2026-08-25", amount: 300_000 })] })
    expect(r.weeks[0].committed).toBeGreaterThanOrEqual(300_000)
  })

  it("detects a shortfall week when outflows exceed available cash and requirement", () => {
    const r = projectCashPosition13Weeks({
      asOfDate: "2026-08-24",
      openingCash: 50_000,
      history,
      receivables: [],
      payables: [payable({ dueDate: "2026-08-25", amount: 2_000_000 })],
      minimumLiquidityRequirement: 100_000,
    })
    expect(r.worstWeek?.potentialShortfall).toBeGreaterThan(0)
  })

  it("reports zero shortfall when cash comfortably covers everything", () => {
    const r = projectCashPosition13Weeks({ asOfDate: "2026-08-24", openingCash: 50_000_000, history, receivables: [], payables: [], minimumLiquidityRequirement: 1 })
    expect(r.worstWeek?.potentialShortfall).toBe(0)
  })

  it("handles an empty cash-flow history without throwing", () => {
    const r = projectCashPosition13Weeks({ asOfDate: "2026-08-24", openingCash: 100_000, history: [], receivables: [], payables: [] })
    expect(r.weeks).toHaveLength(13)
  })

  it("respects a custom horizon", () => {
    const r = projectCashPosition13Weeks({ asOfDate: "2026-08-24", openingCash: 100_000, history, receivables: [], payables: [], horizonWeeks: 4 })
    expect(r.weeks).toHaveLength(4)
  })
})

import { describe, expect, it } from "vitest"
import { ENTITY_USA, USA_ANNUAL_COGS, USA_ANNUAL_REVENUE, USA_BANK_ACCOUNTS, USA_FUNDING_FACILITIES, USA_PAYABLES, USA_RECEIVABLES } from "./demo-data"
import { buildOpportunities } from "./opportunities"

describe("buildOpportunities", () => {
  const ctx = {
    workerId: "worker_test",
    bankAccounts: USA_BANK_ACCOUNTS,
    receivables: USA_RECEIVABLES,
    payables: USA_PAYABLES,
    fundingFacilities: USA_FUNDING_FACILITIES,
    annualCreditSales: USA_ANNUAL_REVENUE,
    annualCOGS: USA_ANNUAL_COGS,
    targetDSODays: 40,
    targetDPODays: 45,
    minReserveYieldPct: 0.5,
  }

  it("produces between 3 and 7 opportunities from the real USA demo dataset", () => {
    const opps = buildOpportunities(ctx)
    expect(opps.length).toBeGreaterThanOrEqual(3)
    expect(opps.length).toBeLessThanOrEqual(7)
  })

  it("every opportunity carries real evidence and assumptions", () => {
    const opps = buildOpportunities(ctx)
    for (const o of opps) {
      expect(o.evidence.length).toBeGreaterThan(0)
      expect(o.workerId).toBe("worker_test")
      expect(o.economics.priorityValue).toBeDefined()
    }
  })

  it("sorts opportunities by priority value, descending", () => {
    const opps = buildOpportunities(ctx)
    for (let i = 1; i < opps.length; i++) {
      expect(opps[i - 1].economics.priorityValue).toBeGreaterThanOrEqual(opps[i].economics.priorityValue)
    }
  })

  it("produces no opportunities when there is nothing to detect", () => {
    const emptyCtx = { ...ctx, bankAccounts: [], receivables: [], payables: [], fundingFacilities: [], targetDSODays: 1000, targetDPODays: 0 }
    const opps = buildOpportunities(emptyCtx)
    expect(opps).toHaveLength(0)
  })

  it("includes the early-payment discount opportunity when discountable payables exist", () => {
    const opps = buildOpportunities(ctx)
    expect(opps.some((o) => o.category === "early_payment_discount")).toBe(true)
  })

  it("scopes each opportunity to the entity's own currency", () => {
    const opps = buildOpportunities(ctx)
    expect(opps.every((o) => o.currency === "USD")).toBe(true)
    expect(ENTITY_USA).toBe("ent_usa")
  })
})

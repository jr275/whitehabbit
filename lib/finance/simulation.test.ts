import { describe, expect, it } from "vitest"
import { runScenario, type ScenarioBaseline } from "./simulation"

const baseline: ScenarioBaseline = {
  label: "Northstar USA",
  receivablesTotal: 1_340_000,
  payablesTotal: 560_000,
  annualCreditSales: 10_400_000,
  annualCOGS: 6_600_000,
  fundingDrawn: 500_000,
  fundingRatePct: 7.25,
}

describe("runScenario", () => {
  it("computes receivables release for a DSO improvement", () => {
    const r = runScenario(baseline, { dsoTargetDays: 40 }, "DSO improvement")
    expect(r.receivablesRelease).toBeGreaterThan(0)
    expect(r.payablesRelease).toBe(0)
    expect(r.cashImpact).toBe(r.receivablesRelease)
  })

  it("computes payables release for a DPO extension", () => {
    const r = runScenario(baseline, { dpoTargetDays: 45 }, "DPO extension")
    expect(r.payablesRelease).toBeGreaterThan(0)
    expect(r.receivablesRelease).toBe(0)
  })

  it("combines multiple changes in one scenario", () => {
    const r = runScenario(baseline, { dsoTargetDays: 40, dpoTargetDays: 45 }, "Combined")
    expect(r.receivablesRelease).toBeGreaterThan(0)
    expect(r.payablesRelease).toBeGreaterThan(0)
    expect(r.cashImpact).toBeCloseTo(r.receivablesRelease + r.payablesRelease, 2)
  })

  it("applies a funding rate delta against the drawn balance", () => {
    const r = runScenario(baseline, { fundingRatePctDelta: -1 }, "Rate reduction")
    expect(r.cashImpact).toBeGreaterThan(0) // paying a lower rate is a positive cash effect
  })

  it("returns zero impact when no changes are given", () => {
    const r = runScenario(baseline, {}, "No change")
    expect(r.cashImpact).toBe(0)
    expect(r.economicImpact).toBe(0)
  })

  it("produces a negative economic impact for a worsening scenario", () => {
    const r = runScenario(baseline, { dsoTargetDays: 60 }, "DSO worsens")
    expect(r.receivablesRelease).toBeLessThan(0)
    expect(r.economicImpact).toBeLessThan(0)
  })

  it("handles a zero-receivables baseline without dividing by zero", () => {
    const zeroBaseline: ScenarioBaseline = { ...baseline, receivablesTotal: 0 }
    const r = runScenario(zeroBaseline, { dsoTargetDays: 10 }, "Zero AR")
    expect(Number.isFinite(r.cashImpact)).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import { buildOpportunityEconomics, calculateEconomicImpact, calculateEffortAdjustment, calculateExpectedValue, calculatePriority, calculateRiskAdjustment } from "./economics"

describe("calculateEconomicImpact", () => {
  it("passes through a rounded value", () => {
    expect(calculateEconomicImpact(500_000.456)).toBe(500_000.46)
  })
})

describe("calculateExpectedValue", () => {
  it("multiplies impact by probability", () => {
    expect(calculateExpectedValue(500_000, 0.82)).toBe(410_000)
  })
  it("clamps probability above 1", () => {
    expect(calculateExpectedValue(1000, 5)).toBe(1000)
  })
  it("clamps negative probability to zero", () => {
    expect(calculateExpectedValue(1000, -1)).toBe(0)
  })
  it("returns zero for zero impact", () => {
    expect(calculateExpectedValue(0, 0.9)).toBe(0)
  })
})

describe("calculateRiskAdjustment", () => {
  it("returns a negative dollar figure", () => {
    expect(calculateRiskAdjustment(410_000, 0.1)).toBe(-41_000)
  })
  it("is always negative even given a negative riskPct input", () => {
    expect(calculateRiskAdjustment(410_000, -0.1)).toBeLessThanOrEqual(0)
  })
})

describe("calculateEffortAdjustment", () => {
  it("returns a negative dollar figure", () => {
    expect(calculateEffortAdjustment(410_000, 0.05)).toBe(-20_500)
  })
})

describe("calculatePriority", () => {
  it("sums expected value and both adjustments", () => {
    expect(calculatePriority(410_000, -40_000, -20_000)).toBe(350_000)
  })
  it("can be negative when adjustments exceed expected value", () => {
    expect(calculatePriority(1000, -800, -800)).toBeLessThan(0)
  })
})

describe("buildOpportunityEconomics", () => {
  it("assembles the full transparent chain", () => {
    const e = buildOpportunityEconomics(500_000, 0.82, "low", "low")
    expect(e.grossImpact).toBe(500_000)
    expect(e.expectedValue).toBe(410_000)
    expect(e.riskAdjustment).toBeLessThan(0)
    expect(e.effortAdjustment).toBeLessThan(0)
    expect(e.priorityValue).toBe(e.expectedValue + e.riskAdjustment + e.effortAdjustment)
  })
  it("applies a larger risk adjustment for higher risk tiers", () => {
    const low = buildOpportunityEconomics(100_000, 1, "low", "low")
    const high = buildOpportunityEconomics(100_000, 1, "high", "low")
    expect(Math.abs(high.riskAdjustment)).toBeGreaterThan(Math.abs(low.riskAdjustment))
  })
  it("handles zero gross impact without error", () => {
    const e = buildOpportunityEconomics(0, 0.5, "low", "low")
    expect(e.priorityValue).toBe(0)
  })
})

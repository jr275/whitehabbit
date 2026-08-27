import { describe, expect, it } from "vitest"
import { generateBusinessOutput } from "./business-output"
import type { Decision, LiquiditySignal, Opportunity } from "./types"

function opp(expectedValue: number): Opportunity {
  return {
    id: "opp_1",
    category: "idle_cash",
    title: "Test",
    description: "Test",
    estimatedValue: expectedValue,
    currency: "USD",
    probability: 1,
    expectedValue,
    urgency: "low",
    effort: "low",
    risk: "low",
    reversibility: "reversible",
    confidence: 90,
    evidence: [],
    assumptions: [],
    recommendedAction: "Do it",
    economics: { grossImpact: expectedValue, probability: 1, expectedValue, riskAdjustment: 0, effortAdjustment: 0, priorityValue: expectedValue },
    status: "READY",
    createdAt: Date.now(),
    workerId: "w1",
  }
}

function decision(annualBenefit: number, status: Decision["action"]["status"]): Decision {
  return {
    id: "dec_1",
    title: "Test",
    problem: "Test",
    evidence: [],
    assumptions: [],
    alternatives: [],
    scenario: { label: "s", baseline: {}, scenario: {}, receivablesRelease: 0, payablesRelease: 0, cashImpact: 0, liquidityImpact: 0, economicImpact: annualBenefit, kind: "SIMULATION" },
    economicImpact: { cashRelease: 0, annualBenefit, currency: "USD" },
    risk: "low",
    recommendation: "Do it",
    confidence: 90,
    policyStatus: "ALLOWED",
    approvalStatus: "NOT_REQUIRED",
    action: { id: "a1", type: "REALLOCATE_IDLE_CASH", target: "x", current: "x", proposed: "y", economicImpact: "x", risk: "low", amount: 1000, currency: "USD", isNewCounterparty: false, status, approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" },
    status: "READY",
    createdAt: Date.now(),
    workerId: "w1",
    opportunityId: "opp_1",
  }
}

const signal: LiquiditySignal = { id: "sig_1", type: "liquidity_shortfall", severity: "medium", confidence: 80, evidence: [] }

describe("generateBusinessOutput", () => {
  it("sums expected value and annual benefit across opportunities/decisions", () => {
    const out = generateBusinessOutput([opp(100_000), opp(50_000)], [decision(20_000, "READY")], [], [])
    expect(out.cashReleasedPotential).toBe(150_000)
    expect(out.economicBenefitPotential).toBe(20_000)
    expect(out.opportunitiesCount).toBe(2)
    expect(out.recommendationsCount).toBe(1)
    expect(out.label).toBe("ESTIMATED")
    expect(out.provenance).toBe("demo")
  })

  it("counts only PREPARED/READY actions toward actionsPreparedCount", () => {
    const out = generateBusinessOutput([], [decision(0, "READY"), decision(0, "PREPARED"), decision(0, "NOT_CONFIGURED")], [], [])
    expect(out.actionsPreparedCount).toBe(2)
  })

  it("reports 'none' liquidity risk when there are no signals", () => {
    const out = generateBusinessOutput([], [], [], [])
    expect(out.liquidityRiskBefore).toBe("none")
    expect(out.liquidityRiskAfter).toBe("none")
  })

  it("reports the worst severity when multiple signals exist", () => {
    const out = generateBusinessOutput([], [], [signal, { ...signal, id: "sig_2", severity: "high" }], [])
    expect(out.liquidityRiskBefore).toBe("high")
  })

  it("handles empty opportunities and decisions without error", () => {
    const out = generateBusinessOutput([], [], [], [])
    expect(out.cashReleasedPotential).toBe(0)
    expect(out.economicBenefitPotential).toBe(0)
  })
})

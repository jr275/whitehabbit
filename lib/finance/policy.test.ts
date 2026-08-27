import { describe, expect, it } from "vitest"
import { DEFAULT_FINANCIAL_POLICIES, evaluatePolicy } from "./policy"
import type { ProposedAction } from "./types"

function action(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    id: "act_1",
    type: "NEGOTIATE_PAYMENT_TERMS",
    target: "Test Supplier",
    current: "30 days",
    proposed: "45 days",
    economicImpact: "$50,000 cash release",
    risk: "low",
    amount: 50_000,
    currency: "USD",
    isNewCounterparty: false,
    status: "PREPARED",
    approval: "NOT_REQUIRED",
    execution: "NOT_EXECUTED",
    ...overrides,
  }
}

describe("evaluatePolicy", () => {
  it("allows a small, low-risk, existing-counterparty action", () => {
    const r = evaluatePolicy(action({ amount: 50_000 }))
    expect(r.status).toBe("ALLOWED")
    expect(r.matchedPolicies).toEqual([])
  })

  it("requires Finance Manager approval above $100k", () => {
    const r = evaluatePolicy(action({ amount: 150_000 }))
    expect(r.status).toBe("APPROVAL_REQUIRED")
    expect(r.requiredApprover).toBe("Finance Manager")
  })

  it("requires CFO approval above $1M", () => {
    const r = evaluatePolicy(action({ amount: 1_500_000 }))
    expect(r.status).toBe("APPROVAL_REQUIRED")
    expect(r.requiredApprover).toBe("CFO")
  })

  it("blocks a high-risk action regardless of amount", () => {
    const r = evaluatePolicy(action({ amount: 1000, risk: "high" }))
    expect(r.status).toBe("BLOCKED")
  })

  it("blocks even when the amount would otherwise be allowed and low-risk matched too", () => {
    const r = evaluatePolicy(action({ amount: 150_000, risk: "critical" }))
    expect(r.status).toBe("BLOCKED") // BLOCKED outranks APPROVAL_REQUIRED
  })

  it("requires Controller approval for a new counterparty", () => {
    const r = evaluatePolicy(action({ amount: 1000, isNewCounterparty: true }))
    expect(r.status).toBe("APPROVAL_REQUIRED")
    expect(r.requiredApprover).toBe("Controller")
  })

  it("handles a boundary amount exactly at $100,000 as allowed (exclusive threshold)", () => {
    const r = evaluatePolicy(action({ amount: 100_000 }))
    expect(r.status).toBe("ALLOWED")
  })

  it("handles zero-amount actions", () => {
    const r = evaluatePolicy(action({ amount: 0 }))
    expect(r.status).toBe("ALLOWED")
  })

  it("uses DEFAULT_FINANCIAL_POLICIES when no policies are passed", () => {
    const r = evaluatePolicy(action({ amount: 150_000 }))
    expect(r.matchedPolicies).toEqual(expect.arrayContaining(DEFAULT_FINANCIAL_POLICIES.filter((p) => p.matches(action({ amount: 150_000 }))).map((p) => p.id)))
  })
})

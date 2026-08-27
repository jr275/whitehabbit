import { describe, expect, it } from "vitest"
import { gateAction } from "./autonomy-gate"
import { evaluatePolicy } from "./policy"
import type { ProposedAction } from "./types"

const draft: Omit<ProposedAction, "status" | "approval" | "execution"> = {
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
}

describe("gateAction", () => {
  it("never prepares an action at Level 0 (observe)", () => {
    const policy = evaluatePolicy({ ...draft, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" })
    const r = gateAction(draft, "observe", policy)
    expect(r.action.status).toBe("NOT_CONFIGURED")
    expect(r.action.execution).toBe("NOT_EXECUTED")
  })

  it("never prepares an action at Level 1 (recommend)", () => {
    const policy = evaluatePolicy({ ...draft, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" })
    const r = gateAction(draft, "recommend", policy)
    expect(r.action.status).toBe("NOT_CONFIGURED")
  })

  it("prepares but always requires approval at Level 2 (prepare)", () => {
    const policy = evaluatePolicy({ ...draft, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" })
    const r = gateAction(draft, "prepare", policy)
    expect(r.action.status).toBe("PREPARED")
    expect(r.action.approval).toBe("REQUIRED")
    expect(r.action.execution).toBe("NOT_EXECUTED")
  })

  it("marks READY with no approval at Level 3 when policy allows", () => {
    const policy = evaluatePolicy({ ...draft, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" })
    const r = gateAction(draft, "execute_within_policy", policy)
    expect(r.action.status).toBe("READY")
    expect(r.action.approval).toBe("NOT_REQUIRED")
    expect(r.action.execution).toBe("NOT_EXECUTED") // never a real execution, even when policy allows
  })

  it("still requires approval at Level 3 when a policy matches APPROVAL_REQUIRED", () => {
    const bigAction = { ...draft, amount: 500_000 }
    const policy = evaluatePolicy({ ...bigAction, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" })
    const r = gateAction(bigAction, "execute_within_policy", policy)
    expect(r.action.status).toBe("PREPARED")
    expect(r.action.approval).toBe("REQUIRED")
  })

  it("blocks a high-risk action at any autonomy level, including Level 3", () => {
    const riskyAction = { ...draft, risk: "high" as const }
    const policy = evaluatePolicy({ ...riskyAction, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" })
    expect(policy.status).toBe("BLOCKED")
    const r = gateAction(riskyAction, "execute_within_policy", policy)
    expect(r.action.status).toBe("NOT_CONFIGURED")
    expect(r.action.execution).toBe("NOT_EXECUTED")
  })
})

import { describe, expect, it } from "vitest"
import { gateAction } from "./autonomy-gate"
import { evaluateDecisionReadiness, generateDecision } from "./decisions"
import { ENTITY_USA, USA_ANNUAL_COGS, USA_ANNUAL_REVENUE, USA_BANK_ACCOUNTS, USA_FUNDING_FACILITIES, USA_PAYABLES, USA_RECEIVABLES } from "./demo-data"
import { buildOpportunities } from "./opportunities"
import { evaluatePolicy } from "./policy"
import { runScenario } from "./simulation"
import type { ProposedAction } from "./types"

describe("generateDecision", () => {
  it("assembles a full Decision from a real Opportunity", () => {
    const opps = buildOpportunities({
      workerId: "worker_test",
      skillId: "skill_cash_working_capital_intelligence",
      entityId: ENTITY_USA,
      bankAccounts: USA_BANK_ACCOUNTS,
      receivables: USA_RECEIVABLES,
      payables: USA_PAYABLES,
      fundingFacilities: USA_FUNDING_FACILITIES,
      annualCreditSales: USA_ANNUAL_REVENUE,
      annualCOGS: USA_ANNUAL_COGS,
      targetDSODays: 40,
      targetDPODays: 45,
      minReserveYieldPct: 0.5,
    })
    const opp = opps.find((o) => o.category === "supplier_payment_terms")!
    expect(opp).toBeDefined()

    const scenario = runScenario(
      { label: "Northstar USA", receivablesTotal: 1_340_000, payablesTotal: 560_000, annualCreditSales: USA_ANNUAL_REVENUE, annualCOGS: USA_ANNUAL_COGS, fundingDrawn: 500_000, fundingRatePct: 7.25 },
      { dpoTargetDays: 45 },
      "Supplier term extension",
    )
    const draft: Omit<ProposedAction, "status" | "approval" | "execution"> = {
      id: "act_1",
      type: "NEGOTIATE_PAYMENT_TERMS",
      target: ENTITY_USA,
      current: "31 days",
      proposed: "45 days",
      economicImpact: `${scenario.payablesRelease} cash release`,
      risk: opp.risk,
      amount: opp.estimatedValue,
      currency: "USD",
      isNewCounterparty: false,
    }
    const policy = evaluatePolicy({ ...draft, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" })
    const gate = gateAction(draft, "prepare", policy)

    const decision = generateDecision(opp, scenario, policy, gate, "worker_test", "exec_1")
    expect(decision.title).toBe(opp.title)
    expect(decision.opportunityId).toBe(opp.id)
    expect(decision.entityId).toBe(ENTITY_USA)
    expect(decision.skillId).toBe(opp.skillId)
    expect(decision.action.status).toBe("PREPARED")
    expect(decision.action.execution).toBe("REQUIRES_CONNECTOR")
    expect(decision.executionStatus).toBe(decision.action.execution)
    expect(decision.downside).toBeTruthy()
    expect(decision.dataProvenance).toBe("demo")
    expect(decision.economicState).toBe("estimated")
    expect(decision.evidence.length).toBeGreaterThan(0)
    expect(decision.economicImpact.cashRelease).toBeGreaterThanOrEqual(0)
  })

  it("marks a decision INSUFFICIENT_DATA when the opportunity's confidence is below the minimum", () => {
    const opps = buildOpportunities({
      workerId: "worker_test",
      skillId: "skill_cash_working_capital_intelligence",
      entityId: ENTITY_USA,
      bankAccounts: USA_BANK_ACCOUNTS,
      receivables: USA_RECEIVABLES,
      payables: USA_PAYABLES,
      fundingFacilities: USA_FUNDING_FACILITIES,
      annualCreditSales: USA_ANNUAL_REVENUE,
      annualCOGS: USA_ANNUAL_COGS,
      targetDSODays: 40,
      targetDPODays: 45,
      minReserveYieldPct: 0.5,
    })
    const opp = { ...opps[0], confidence: 10 } // force a real opportunity below the confidence bar
    const draft: Omit<ProposedAction, "status" | "approval" | "execution"> = {
      id: "act_low_confidence",
      type: "REALLOCATE_IDLE_CASH",
      target: ENTITY_USA,
      current: "x",
      proposed: "y",
      economicImpact: "x",
      risk: opp.risk,
      amount: opp.estimatedValue,
      currency: "USD",
      isNewCounterparty: false,
    }
    const readiness = evaluateDecisionReadiness(opp)
    expect(readiness?.status).toBe("INSUFFICIENT_DATA")
    const gate = gateAction(draft, "execute_within_policy", readiness!)
    const decision = generateDecision(opp, runScenario({ label: "x", receivablesTotal: 0, payablesTotal: 0, annualCreditSales: 1, annualCOGS: 1, fundingDrawn: 0, fundingRatePct: 0 }, {}, "x"), readiness!, gate, "worker_test")
    expect(decision.policyStatus).toBe("INSUFFICIENT_DATA")
    expect(decision.action.status).toBe("NOT_CONFIGURED")
  })
})

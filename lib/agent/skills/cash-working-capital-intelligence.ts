import "server-only"

/* ================================================================== *
 * SKILL: CASH & WORKING CAPITAL INTELLIGENCE — the first complete,
 * load-bearing Financial Intelligence loop (Phase 3):
 *
 *   DATA -> NORMALIZE -> ANALYZE -> DETECT -> QUANTIFY -> PRIORITIZE ->
 *   SIMULATE -> RECOMMEND -> POLICY CHECK -> BUSINESS OUTPUT
 *
 * Unlike the four earlier financial skills (cash-position-monitor,
 * cash-forecast, working-capital-opportunity, receivables-risk), this
 * skill's core arithmetic is 100% deterministic — every DSO/DPO/CCC/
 * cash-projection/opportunity/decision number comes from a pure
 * function in lib/finance/*, never an LLM (§33–34). No LLM call
 * happens in this skill at all; nothing here is randomized, and
 * running it twice against the same demo data produces byte-identical
 * numbers.
 *
 * Every step below is a real ctx.emit — the existing WorkerEvent/
 * execution pipeline (lib/agent/runtime.ts) persists each one exactly
 * like it does for every other skill (§24, §25). This is not a second
 * execution engine.
 * ================================================================== */

import { gateAction } from "@/lib/finance/autonomy-gate"
import { generateBusinessOutput } from "@/lib/finance/business-output"
import { projectCashPosition13Weeks } from "@/lib/finance/cash-projection"
import { generateDecision } from "@/lib/finance/decisions"
import {
  ENTITY_USA,
  USA_ANNUAL_COGS,
  USA_ANNUAL_REVENUE,
  USA_BANK_ACCOUNTS,
  USA_CASH_FLOW_HISTORY,
  USA_FUNDING_FACILITIES,
  USA_INVENTORY_VALUE,
  USA_PAYABLES,
  USA_RECEIVABLES,
} from "@/lib/finance/demo-data"
import { calculateCashConcentration, calculateCCC, calculateDIO, calculateDPO, calculateDSO, calculateIdleCash, calculateLiquidityCoverage, calculateWorkingCapital } from "@/lib/finance/metrics"
import { buildOpportunities } from "@/lib/finance/opportunities"
import { DEFAULT_FINANCIAL_POLICIES, evaluatePolicy } from "@/lib/finance/policy"
import { detectCashConcentrationRisk, detectFundingDependency, detectLiquidityRisk } from "@/lib/finance/signals"
import { runScenario } from "@/lib/finance/simulation"
import type { BusinessOutput, Decision, LiquiditySignal, Opportunity, ProposedAction } from "@/lib/finance/types"
import { autonomyLevelFor } from "@/lib/workforce/catalog"
import { DEMO_COMPANY_NAME, DEMO_LEDGER_AS_OF } from "@/lib/agent/data/demo-financial-ledger"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult } from "@/lib/agent/types"
import { SkillBlockedError } from "@/lib/agent/types"

/* DEMO ASSUMPTIONS — internal targets, never presented as an external
 * benchmark (§10, §15). A real Worker's EconomicObjective may one day
 * override these; this phase keeps them fixed and clearly labeled. */
const TARGET_DSO_DAYS = 40
const TARGET_DPO_DAYS = 45
const MIN_RESERVE_YIELD_PCT = 0.5

interface StructuredResult {
  asOfDate: string
  company: string
  metrics: {
    totalCash: number
    dso: number | null
    dpo: number | null
    dio: number | null
    ccc: number | null
    workingCapital: number
    liquidityCoverageRatio: number | null
    idleCash: number
    cashConcentrationPct: number
  }
  projection: ReturnType<typeof projectCashPosition13Weeks>
  signals: LiquiditySignal[]
  opportunities: Opportunity[]
  scenarios: ReturnType<typeof runScenario>[]
  decisions: Decision[]
  businessOutput: BusinessOutput
}

export const cashWorkingCapitalIntelligenceSkill: SkillDefinition = {
  id: "skill_cash_working_capital_intelligence",
  name: "Cash & Working Capital Intelligence",
  description: "Runs a deterministic, auditable pipeline over real (demo) financial facts — cash position, 13-week liquidity projection, working capital ratios, opportunity detection, scenario simulation, policy evaluation — and produces real Opportunities, Decisions, and a Business Output. No LLM call; every number is a pure calculation.",
  category: "finance",
  outputType: "financial_intelligence_run",
  taskTitle: "Run financial intelligence",
  riskLevel: "medium", // its recommendations can touch payment timing and fund allocation, even though nothing here ever executes a real action
  version: "1.0",
  status: "beta", // real, deterministic, but reasoning only over demo data so far — no real financial system connected
  inputs: [],
  requiredTools: ["tool_financial_data"],
  instructions: "Load real (demo) financial facts, compute deterministic metrics, project liquidity, detect and quantify opportunities, simulate at least one scenario, generate decisions, and evaluate them against policy and autonomy.",
  constraints: [
    "Every metric must be computed from the data provided — never hardcoded.",
    "Never claim a real financial action executed — every action stays PREPARED/READY, execution is always NOT_EXECUTED.",
    "Never bypass policy because of autonomy level.",
    "Never present a demo-ledger figure as real, connected financial data.",
  ],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }
    const financialData = ctx.tools.get("tool_financial_data")
    if (!financialData) throw new SkillBlockedError("Financial Data tool is not registered on this worker.")

    /* ---- STEP 01: LOAD FINANCIAL CONTEXT ---- */
    ctx.emit("tool_called", { step: "LOAD FINANCIAL CONTEXT", stepNumber: 1, tool: financialData.id })
    const step1Start = Date.now()
    for (const actionId of ["getCashPosition", "getReceivables", "getPayables", "getCashFlowHistory", "getSuppliers", "getCustomers", "getFundingFacilities", "getAnnualFigures"]) {
      const action = financialData.actions.find((a) => a.id === actionId)!
      const result = await runToolAction(financialData.id, financialData.name, action, {}, toolCtx)
      if (!result.ok) {
        if (result.blocked) throw new SkillBlockedError(result.blockedReason ?? "Financial Data is blocked.")
        throw new Error(result.error ?? `${actionId} failed.`)
      }
    }
    ctx.emit("tool_completed", { step: "LOAD FINANCIAL CONTEXT", stepNumber: 1, durationMs: Date.now() - step1Start, detail: `${DEMO_COMPANY_NAME} (Northstar USA) as of ${DEMO_LEDGER_AS_OF}` })

    const bankAccounts = USA_BANK_ACCOUNTS
    const receivables = USA_RECEIVABLES.filter((r) => r.status !== "paid")
    const payables = USA_PAYABLES
    const totalReceivables = receivables.reduce((s, r) => s + r.amount, 0)
    const totalPayables = payables.reduce((s, p) => s + p.amount, 0)
    const totalCash = bankAccounts.reduce((s, a) => s + a.balance, 0)

    /* ---- STEP 02: CALCULATE CASH POSITION ---- */
    ctx.emit("reasoning_started", { step: "CALCULATE CASH POSITION", stepNumber: 2 })
    const step2Start = Date.now()
    const concentration = calculateCashConcentration(bankAccounts)
    const idle = calculateIdleCash(bankAccounts, MIN_RESERVE_YIELD_PCT)
    const workingCapital = calculateWorkingCapital(totalCash, totalReceivables, USA_INVENTORY_VALUE, totalPayables)
    ctx.emit("reasoning_completed", { step: "CALCULATE CASH POSITION", stepNumber: 2, durationMs: Date.now() - step2Start, detail: `Total cash ${totalCash.toLocaleString()}; working capital ${workingCapital.workingCapital.toLocaleString()}` })

    /* ---- STEP 03: PROJECT 13-WEEK LIQUIDITY ---- */
    ctx.emit("reasoning_started", { step: "PROJECT 13-WEEK LIQUIDITY", stepNumber: 3 })
    const step3Start = Date.now()
    const projection = projectCashPosition13Weeks({
      asOfDate: DEMO_LEDGER_AS_OF,
      openingCash: totalCash,
      history: USA_CASH_FLOW_HISTORY,
      receivables,
      payables,
    })
    const liquidityCoverage = calculateLiquidityCoverage(totalCash, projection.minimumMinCash)
    ctx.emit("reasoning_completed", { step: "PROJECT 13-WEEK LIQUIDITY", stepNumber: 3, durationMs: Date.now() - step3Start, detail: `Worst week: ${projection.worstWeek?.weekStart ?? "none"} (available cash ${projection.worstWeek?.availableCash.toLocaleString() ?? "n/a"})` })

    const signalsBefore: LiquiditySignal[] = [
      detectLiquidityRisk(projection),
      detectCashConcentrationRisk(concentration),
      detectFundingDependency(USA_FUNDING_FACILITIES[0]?.drawn ?? 0, USA_FUNDING_FACILITIES[0]?.limit ?? 0),
    ].filter((s): s is LiquiditySignal => s !== null)

    /* ---- STEP 04: ANALYZE WORKING CAPITAL ---- */
    ctx.emit("reasoning_started", { step: "ANALYZE WORKING CAPITAL", stepNumber: 4 })
    const step4Start = Date.now()
    const dso = calculateDSO(totalReceivables, USA_ANNUAL_REVENUE)
    const dpo = calculateDPO(totalPayables, USA_ANNUAL_COGS)
    const dio = calculateDIO(USA_INVENTORY_VALUE, USA_ANNUAL_COGS)
    const ccc = calculateCCC(dio, dso, dpo)
    ctx.emit("reasoning_completed", { step: "ANALYZE WORKING CAPITAL", stepNumber: 4, durationMs: Date.now() - step4Start, detail: `DSO ${dso.value ?? "n/a"}d · DPO ${dpo.value ?? "n/a"}d · CCC ${ccc.value ?? "n/a"}d` })

    /* ---- STEP 05: DETECT OPPORTUNITIES ---- */
    ctx.emit("reasoning_started", { step: "DETECT OPPORTUNITIES", stepNumber: 5 })
    const step5Start = Date.now()
    const opportunities = buildOpportunities({
      workerId: ctx.workerId,
      executionId: ctx.executionId,
      bankAccounts,
      receivables,
      payables,
      fundingFacilities: USA_FUNDING_FACILITIES,
      annualCreditSales: USA_ANNUAL_REVENUE,
      annualCOGS: USA_ANNUAL_COGS,
      targetDSODays: TARGET_DSO_DAYS,
      targetDPODays: TARGET_DPO_DAYS,
      minReserveYieldPct: MIN_RESERVE_YIELD_PCT,
    })
    ctx.emit("reasoning_completed", { step: "DETECT OPPORTUNITIES", stepNumber: 5, durationMs: Date.now() - step5Start, detail: `${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} detected` })

    /* ---- STEP 06: QUANTIFY ECONOMIC IMPACT ---- (already computed
     * inline per-opportunity by buildOpportunityEconomics; this step
     * confirms the aggregate real total, it does not recompute) */
    const totalExpectedValue = opportunities.reduce((s, o) => s + o.expectedValue, 0)
    ctx.emit("tool_completed", { step: "QUANTIFY ECONOMIC IMPACT", stepNumber: 6, detail: `Total expected value across opportunities: ${Math.round(totalExpectedValue).toLocaleString()}` })

    /* ---- STEP 07: SIMULATE SCENARIOS ---- */
    ctx.emit("reasoning_started", { step: "SIMULATE SCENARIOS", stepNumber: 7 })
    const step7Start = Date.now()
    const scenarioBaseline = {
      label: "Northstar USA",
      receivablesTotal: totalReceivables,
      payablesTotal: totalPayables,
      annualCreditSales: USA_ANNUAL_REVENUE,
      annualCOGS: USA_ANNUAL_COGS,
      fundingDrawn: USA_FUNDING_FACILITIES[0]?.drawn ?? 0,
      fundingRatePct: USA_FUNDING_FACILITIES[0]?.ratePct ?? 0,
    }
    const scenarios = [
      runScenario(scenarioBaseline, { dsoTargetDays: TARGET_DSO_DAYS }, "Receivables acceleration"),
      runScenario(scenarioBaseline, { dpoTargetDays: TARGET_DPO_DAYS }, "Supplier term extension"),
    ]
    ctx.emit("reasoning_completed", { step: "SIMULATE SCENARIOS", stepNumber: 7, durationMs: Date.now() - step7Start, detail: `${scenarios.length} scenarios simulated` })

    /* ---- STEP 08: EVALUATE POLICIES + autonomy gating (§18–19) ---- */
    ctx.emit("reasoning_started", { step: "EVALUATE POLICIES", stepNumber: 8 })
    const step8Start = Date.now()
    const autonomyLevel = autonomyLevelFor(ctx.worker.autonomy)
    const decisions: Decision[] = []
    const readyOpportunities = opportunities.filter((o) => o.status === "READY").slice(0, 3) // top 3 by priority (already sorted)
    for (const opportunity of readyOpportunities) {
      const scenario = scenarioFor(opportunity, scenarios)
      const draft: Omit<ProposedAction, "status" | "approval" | "execution"> = {
        id: `act_${opportunity.id}`,
        type: actionTypeFor(opportunity.category),
        target: ENTITY_USA,
        current: currentStateFor(opportunity, dso.value, dpo.value),
        proposed: proposedStateFor(opportunity),
        economicImpact: `${Math.round(opportunity.expectedValue).toLocaleString()} expected value`,
        risk: opportunity.risk,
        amount: Math.round(opportunity.estimatedValue),
        currency: opportunity.currency,
        isNewCounterparty: false,
      }
      const policy = evaluatePolicy({ ...draft, status: "PREPARED", approval: "NOT_REQUIRED", execution: "NOT_EXECUTED" }, DEFAULT_FINANCIAL_POLICIES)
      const gate = gateAction(draft, autonomyLevel, policy)
      decisions.push(generateDecision(opportunity, scenario, policy, gate, ctx.workerId, ctx.executionId))
    }
    ctx.emit("reasoning_completed", {
      step: "EVALUATE POLICIES",
      stepNumber: 8,
      durationMs: Date.now() - step8Start,
      detail: `Autonomy: ${autonomyLevel} · ${decisions.filter((d) => d.policyStatus === "ALLOWED").length} allowed, ${decisions.filter((d) => d.policyStatus === "APPROVAL_REQUIRED").length} need approval, ${decisions.filter((d) => d.policyStatus === "BLOCKED").length} blocked`,
    })

    /* ---- STEP 09: GENERATE RECOMMENDATIONS ---- (decisions above ARE
     * the recommendations — this step confirms the real count) */
    ctx.emit("tool_completed", { step: "GENERATE RECOMMENDATIONS", stepNumber: 9, detail: `${decisions.length} decision${decisions.length === 1 ? "" : "s"} generated` })

    /* ---- STEP 10: PERSIST BUSINESS OUTPUTS ----
     * The actual DB write happens moments later in lib/agent/runtime.ts
     * (repo.insertOutput / insertOpportunity / insertDecision) — this
     * step marks the pipeline's own work as complete and about to be
     * handed to that real, existing persistence path (§22). */
    const liquiditySignalAfter = signalsBefore.length > 0 && opportunities.length > 0 ? mitigatedSeverity(signalsBefore) : signalsBefore
    const businessOutput = generateBusinessOutput(opportunities, decisions, signalsBefore, liquiditySignalAfter)
    ctx.emit("tool_completed", { step: "PERSIST BUSINESS OUTPUTS", stepNumber: 10, detail: `Cash released potential: ${businessOutput.cashReleasedPotential.toLocaleString()}` })

    const structured: StructuredResult = {
      asOfDate: DEMO_LEDGER_AS_OF,
      company: DEMO_COMPANY_NAME,
      metrics: {
        totalCash,
        dso: dso.value,
        dpo: dpo.value,
        dio: dio.value,
        ccc: ccc.value,
        workingCapital: workingCapital.workingCapital,
        liquidityCoverageRatio: liquidityCoverage.coverageRatio,
        idleCash: idle.totalIdle,
        cashConcentrationPct: concentration.maxConcentrationPct,
      },
      projection,
      signals: signalsBefore,
      opportunities,
      scenarios,
      decisions,
      businessOutput,
    }

    return {
      structured,
      summary: renderSummary(structured),
      sources: [{ title: "Demo Financial Ledger — Northstar USA", url: "internal://demo-ledger/northstar-usa", provider: "Demo Financial Ledger", snippet: `${bankAccounts.length} accounts, ${receivables.length} receivables, ${payables.length} payables` }],
      dataProvenance: "demo",
      opportunities,
      decisions,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const structured = result.structured as StructuredResult
    const groundedInEvidence = structured.opportunities.every((o) => o.evidence.length > 0)
    const hasProjection = structured.projection.weeks.length === 13
    const hasScenarios = structured.scenarios.length > 0
    const qualityScore = Math.round((groundedInEvidence ? 40 : 0) + (hasProjection ? 30 : 0) + (hasScenarios ? 20 : 0) + (structured.opportunities.length > 0 ? 10 : 0))
    return {
      qualityScore,
      breakdown: [
        { label: "Evidence grounding", score: groundedInEvidence ? 100 : 0, note: "Every opportunity cites real evidence from the demo dataset." },
        { label: "13-week projection", score: hasProjection ? 100 : 0, note: `${structured.projection.weeks.length}/13 weeks projected.` },
        { label: "Scenario simulation", score: hasScenarios ? 100 : 0, note: `${structured.scenarios.length} scenario(s) simulated.` },
        { label: "Opportunities detected", score: structured.opportunities.length > 0 ? 100 : 0, note: `${structured.opportunities.length} opportunit${structured.opportunities.length === 1 ? "y" : "ies"} found.` },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const structured = result.structured as StructuredResult
    return [
      { key: "opportunities_detected", kind: "operational", value: structured.opportunities.length },
      { key: "decisions_generated", kind: "operational", value: structured.decisions.length },
      { key: "analysis_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
      { key: "cash_released_potential", kind: "business", value: structured.businessOutput.cashReleasedPotential, unit: "$", economicState: "estimated", valueCategory: "working_capital_released" },
      { key: "economic_benefit_potential", kind: "business", value: structured.businessOutput.economicBenefitPotential, unit: "$", economicState: "estimated", valueCategory: "cost_reduced" },
    ]
  },
}

function scenarioFor(opportunity: Opportunity, scenarios: ReturnType<typeof runScenario>[]): ReturnType<typeof runScenario> {
  if (opportunity.category === "receivables_acceleration") return scenarios[0]
  if (opportunity.category === "supplier_payment_terms") return scenarios[1]
  // Opportunities without a dedicated scenario (idle cash, early-pay
  // discount, funding optimization) still need a real ScenarioResult
  // to attach to their Decision — build one directly from the
  // opportunity's own already-computed economics rather than
  // fabricating a second number.
  return {
    label: opportunity.title,
    baseline: {},
    scenario: {},
    receivablesRelease: 0,
    payablesRelease: 0,
    cashImpact: opportunity.estimatedValue,
    liquidityImpact: opportunity.estimatedValue,
    economicImpact: opportunity.expectedValue,
    kind: "SIMULATION",
  }
}

function actionTypeFor(category: Opportunity["category"]): ProposedAction["type"] {
  switch (category) {
    case "supplier_payment_terms":
      return "NEGOTIATE_PAYMENT_TERMS"
    case "idle_cash":
      return "REALLOCATE_IDLE_CASH"
    case "receivables_acceleration":
      return "ACCELERATE_COLLECTION"
    case "early_payment_discount":
      return "CAPTURE_EARLY_PAY_DISCOUNT"
    case "funding_optimization":
      return "ADJUST_FUNDING_DRAW"
  }
}

function currentStateFor(opportunity: Opportunity, dsoValue: number | null, dpoValue: number | null): string {
  if (opportunity.category === "receivables_acceleration") return `${dsoValue ?? "n/a"} days DSO`
  if (opportunity.category === "supplier_payment_terms") return `${dpoValue ?? "n/a"} days DPO`
  return "Current allocation"
}

function proposedStateFor(opportunity: Opportunity): string {
  if (opportunity.category === "receivables_acceleration") return `${TARGET_DSO_DAYS} days DSO`
  if (opportunity.category === "supplier_payment_terms") return `${TARGET_DPO_DAYS} days DPO`
  return opportunity.recommendedAction
}

/** After the top opportunities are addressed, liquidity risk is
 * honestly re-evaluated as one severity tier lower than before —
 * SIMULATED, never claimed as a real, verified improvement (the real
 * signal detection function would need a re-run against updated
 * facts, which does not exist post-action in this phase since no
 * action ever executes). */
function mitigatedSeverity(signals: LiquiditySignal[]): LiquiditySignal[] {
  const rank = { low: 1, medium: 2, high: 3, critical: 4 } as const
  return signals.map((s) => {
    const lowered = Math.max(1, rank[s.severity] - 1)
    const severity = (Object.keys(rank) as (keyof typeof rank)[]).find((k) => rank[k] === lowered) ?? s.severity
    return { ...s, severity }
  })
}

function renderSummary(structured: StructuredResult): string {
  const { metrics, businessOutput, opportunities, decisions } = structured
  const liquidityRisk = structured.signals.length > 0 ? `${structured.signals.length} liquidity signal${structured.signals.length === 1 ? "" : "s"} (worst: ${businessOutput.liquidityRiskBefore})` : "no liquidity risk signal"
  const lines = [
    `Cash & Working Capital Intelligence — ${structured.company} (demo), as of ${structured.asOfDate}`,
    `Current cash position: ${metrics.totalCash.toLocaleString()} across Northstar USA's accounts. Liquidity risk: ${liquidityRisk}.`,
    `DSO ${metrics.dso ?? "n/a"} days · DPO ${metrics.dpo ?? "n/a"} days · CCC ${metrics.ccc ?? "n/a"} days · Working capital ${metrics.workingCapital.toLocaleString()}`,
    `13-week baseline forecast: worst-case available cash ${structured.projection.worstWeek?.availableCash.toLocaleString() ?? "n/a"} in week ${structured.projection.worstWeek?.weekNumber ?? "n/a"}.`,
    opportunities.length > 0
      ? `${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} detected, estimated ${Math.round(businessOutput.cashReleasedPotential).toLocaleString()} in expected cash release (estimated, not yet approved, executed, or verified).`
      : "No opportunities were detected from the current (demo) data.",
    `${decisions.length} decision${decisions.length === 1 ? "" : "s"} generated. No external financial action executed — every prepared action remains NOT_EXECUTED pending human approval.`,
  ]
  return lines.join("\n")
}

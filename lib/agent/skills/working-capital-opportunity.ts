import "server-only"

/* ================================================================== *
 * SKILL: WORKING CAPITAL OPPORTUNITY DETECTION — finds real (demo)
 * opportunities to release or preserve cash: idle low-yield reserves,
 * uncaptured early-payment discounts on payables, receivables that
 * could be collected faster. Same shape as the other financial skills.
 * ================================================================== */

import { DEMO_BANK_ACCOUNTS, DEMO_PAYABLES, totalPayables } from "@/lib/agent/data/demo-financial-ledger"
import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import {
  economicImpactMetric,
  evaluateFinancialFindings,
  FINANCIAL_FINDINGS_SCHEMA_PROMPT,
  financialOperationalMetrics,
  parseFinancialFindings,
  renderFinancialFindingsSummary,
  type FinancialFindingsPayload,
} from "@/lib/agent/skills/finance-shared"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"

const SYSTEM_PROMPT = `You are a working-capital analyst. You are given REAL (demo) cash balances and payables data and must identify genuine opportunities to release or preserve cash — an early-payment discount not being captured, cash sitting idle in a low-yield account that could be better allocated, a payment-timing adjustment. Never invent a discount, balance, or supplier not given to you.

${FINANCIAL_FINDINGS_SCHEMA_PROMPT}`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.behaviors.length) extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

export const workingCapitalOpportunitySkill: SkillDefinition = {
  id: "skill_working_capital_opportunity",
  name: "Working Capital Opportunity Detection",
  description: "Reviews real (demo) cash and payables data and uses an LLM to identify genuine opportunities to release or preserve cash.",
  category: "finance",
  outputType: "working_capital_opportunities",
  taskTitle: "Detect working capital opportunities",
  riskLevel: "medium", // its recommendations can touch payment timing, even though this skill itself never pays anything
  version: "1.0",
  status: "beta", // real, but reasoning only over demo data so far — no real financial system connected
  inputs: [],
  requiredTools: ["tool_financial_data", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: [
    "Every opportunity must cite a real balance, discount, or supplier from the demo ledger.",
    "Never claim a payment was made or a term was changed — this skill only recommends.",
    "Never present a demo-ledger figure as a real, connected financial system's data.",
  ],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const financialData = ctx.tools.get("tool_financial_data")
    if (!financialData) throw new SkillBlockedError("Financial Data tool is not registered on this worker.")
    ctx.emit("tool_called", { tool: financialData.id, toolName: financialData.name, action: "getCashPosition+getPayables" })
    const cashAction = financialData.actions.find((a) => a.id === "getCashPosition")!
    const cashResult = await runToolAction<{ accounts: unknown[]; totalCash: number; idleAccounts: unknown[]; asOfDate: string }>(financialData.id, financialData.name, cashAction, {}, toolCtx)
    if (!cashResult.ok) {
      if (cashResult.blocked) throw new SkillBlockedError(cashResult.blockedReason ?? "Financial Data is blocked.")
      throw new ProviderError(cashResult.error ?? "Cash position lookup failed.")
    }
    const payablesAction = financialData.actions.find((a) => a.id === "getPayables")!
    const payablesResult = await runToolAction<{ payables: unknown[]; totalPayables: number; earlyPayOpportunities: unknown[] }>(financialData.id, financialData.name, payablesAction, {}, toolCtx)
    if (!payablesResult.ok) {
      if (payablesResult.blocked) throw new SkillBlockedError(payablesResult.blockedReason ?? "Financial Data is blocked.")
      throw new ProviderError(payablesResult.error ?? "Payables lookup failed.")
    }
    const cash = cashResult.data!
    const payables = payablesResult.data!
    ctx.emit("tool_completed", { tool: financialData.id, durationMs: cashResult.durationMs + payablesResult.durationMs, accountCount: cash.accounts.length, payableCount: payables.payables.length })

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, "working capital cash")
    const knowledgeBlock = knowledge.length ? `\n\nInternal knowledge provided by the operator:\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}` : ""
    const prompt = `As of ${cash.asOfDate}, here is the real cash position:\n${JSON.stringify(cash, null, 2)}\n\nAnd the real payables:\n${JSON.stringify(payables, null, 2)}${knowledgeBlock}\n\nIdentify genuine working-capital opportunities from this data.`
    const llmResult = await runToolAction<{ text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }>(
      llm.id,
      llm.name,
      analyzeAction,
      { system: buildSystemPrompt(ctx.worker), prompt, maxTokens: 1800 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM analysis failed.")
    }
    const llmData = llmResult.data!
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })

    const parsed = parseFinancialFindings(llmData.text)
    if (!parsed) throw new Error("The LLM response was not valid structured findings data.")

    return {
      structured: parsed,
      summary: renderFinancialFindingsSummary(parsed, "No working-capital opportunities were identified from the current (demo) data."),
      sources: [{ title: "Demo Financial Ledger — Cash & Payables", url: "internal://demo-ledger/working-capital", provider: "Demo Financial Ledger", snippet: `${payables.payables.length} payables, ${cash.accounts.length} accounts` }],
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      provider: llmData.provider,
      executionMode: llmData.executionMode,
      dataProvenance: "demo",
    }
  },

  evaluate: (result): SkillEvaluation => {
    const payload = result.structured as FinancialFindingsPayload
    const ledgerNumbers = DEMO_BANK_ACCOUNTS.map((a) => a.balance)
      .concat(DEMO_PAYABLES.map((p) => p.amount))
      .concat(totalPayables())
    return evaluateFinancialFindings(payload, ledgerNumbers, 1)
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as FinancialFindingsPayload
    const emissions = financialOperationalMetrics(result, evaluation, { analyzedLabel: "accounts_and_payables_analyzed", analyzedCount: DEMO_BANK_ACCOUNTS.length + DEMO_PAYABLES.length })
    const savings = economicImpactMetric(payload, "savings", "working_capital_released", "$")
    return savings ? [...emissions, savings] : emissions
  },
}

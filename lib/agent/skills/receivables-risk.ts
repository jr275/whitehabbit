import "server-only"

/* ================================================================== *
 * SKILL: RECEIVABLES RISK DETECTION — finds real (demo) liquidity risk
 * hiding in accounts receivable: customer concentration, overdue
 * invoices. Same shape as the other financial skills.
 * ================================================================== */

import { DEMO_RECEIVABLES, receivablesConcentration, totalReceivables } from "@/lib/agent/data/demo-financial-ledger"
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

const SYSTEM_PROMPT = `You are a credit-risk analyst. You are given REAL (demo) accounts-receivable data and must identify genuine liquidity risk visible in it — concentration in a small number of customers, invoices that are overdue, a pattern that could create a cash shortfall if a customer pays late or not at all. Never invent a customer, invoice, or amount not given to you.

${FINANCIAL_FINDINGS_SCHEMA_PROMPT}`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.behaviors.length) extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

export const receivablesRiskSkill: SkillDefinition = {
  id: "skill_receivables_risk",
  name: "Receivables Risk Detection",
  description: "Reviews real (demo) receivables data and uses an LLM to identify genuine concentration and overdue-payment risk.",
  category: "finance",
  outputType: "receivables_risk_analysis",
  taskTitle: "Detect receivables risk",
  riskLevel: "low",
  version: "1.0",
  inputs: [],
  requiredTools: ["tool_financial_data", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: [
    "Every finding must cite a real customer, invoice, or amount from the demo ledger.",
    "Never claim a collection call or dunning action was taken — this skill only analyzes.",
    "Never present a demo-ledger figure as a real, connected financial system's data.",
  ],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const financialData = ctx.tools.get("tool_financial_data")
    if (!financialData) throw new SkillBlockedError("Financial Data tool is not registered on this worker.")
    ctx.emit("tool_called", { tool: financialData.id, toolName: financialData.name, action: "getReceivables" })
    const action = financialData.actions.find((a) => a.id === "getReceivables")!
    const result = await runToolAction<{ receivables: unknown[]; totalReceivables: number; overdue: unknown[]; concentration: unknown[]; asOfDate: string }>(
      financialData.id,
      financialData.name,
      action,
      {},
      toolCtx,
    )
    if (!result.ok) {
      if (result.blocked) throw new SkillBlockedError(result.blockedReason ?? "Financial Data is blocked.")
      throw new ProviderError(result.error ?? "Receivables lookup failed.")
    }
    const data = result.data!
    ctx.emit("tool_completed", { tool: financialData.id, durationMs: result.durationMs, receivableCount: data.receivables.length })

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, "receivables collections risk")
    const knowledgeBlock = knowledge.length ? `\n\nInternal knowledge provided by the operator:\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}` : ""
    const prompt = `As of ${data.asOfDate}, here is the real receivables data:\n${JSON.stringify(data, null, 2)}${knowledgeBlock}\n\nIdentify genuine receivables risk findings from this data.`
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
      summary: renderFinancialFindingsSummary(parsed, "No receivables risk was identified from the current (demo) data."),
      sources: [{ title: "Demo Financial Ledger — Receivables", url: "internal://demo-ledger/receivables", provider: "Demo Financial Ledger", snippet: `${data.receivables.length} invoices, total ${data.totalReceivables}` }],
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
    const ledgerNumbers = DEMO_RECEIVABLES.map((r) => r.amount)
      .concat(totalReceivables())
      .concat(receivablesConcentration().map((c) => c.pct))
    return evaluateFinancialFindings(payload, ledgerNumbers, 1)
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as FinancialFindingsPayload
    const emissions = financialOperationalMetrics(result, evaluation, { analyzedLabel: "receivables_analyzed", analyzedCount: DEMO_RECEIVABLES.length })
    const risk = economicImpactMetric(payload, "liquidity_risk_exposure", "risk_exposure_reduced", "$")
    return risk ? [...emissions, risk] : emissions
  },
}

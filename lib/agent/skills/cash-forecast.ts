import "server-only"

/* ================================================================== *
 * SKILL: CASH FORECAST — projects near-term liquidity from a demo,
 * clearly fictional 13-week cash flow history plus current receivables
 * and payables. Same real-LLM-over-real-(demo)-data shape as the other
 * financial skills; see cash-position-monitor.ts's header for the
 * pattern this follows.
 *
 * Honest scope: this projects from the trend already visible in the
 * given 13 weeks of history plus known receivables/payables — it does
 * not claim statistical forecasting sophistication it doesn't have,
 * and every projected shortfall must cite the specific weeks/amounts
 * that produce it.
 * ================================================================== */

import { DEMO_CASH_FLOW_HISTORY, totalPayables, totalReceivables } from "@/lib/agent/data/demo-financial-ledger"
import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import {
  evaluateFinancialFindings,
  FINANCIAL_FINDINGS_SCHEMA_PROMPT,
  financialOperationalMetrics,
  parseFinancialFindings,
  renderFinancialFindingsSummary,
  type FinancialFindingsPayload,
} from "@/lib/agent/skills/finance-shared"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { MetricEmission, SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"

const SYSTEM_PROMPT = `You are a treasury analyst building a short-term cash forecast. You are given REAL weekly cash-flow history, plus current receivables and payables, and must project genuine near-term liquidity risk or comfort visible in the trend — a possible shortfall week, a funding need, or a healthy buffer. Never invent a week, an amount, or a trend not supported by the data given to you.

${FINANCIAL_FINDINGS_SCHEMA_PROMPT}`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.behaviors.length) extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

export const cashForecastSkill: SkillDefinition = {
  id: "skill_cash_forecast",
  name: "Cash Forecast",
  description: "Projects near-term liquidity from real (demo) cash-flow history, receivables and payables, using an LLM to identify genuine shortfall or funding-need risk.",
  category: "finance",
  outputType: "cash_forecast",
  taskTitle: "Forecast cash position",
  riskLevel: "low",
  version: "1.0",
  inputs: [],
  requiredTools: ["tool_financial_data", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: [
    "Every projection must cite the specific weeks/amounts from the 13-week history that support it.",
    "Never present a projection as a certainty — every finding must carry a confidence.",
    "Never present a demo-ledger figure as a real forecast from a connected financial system.",
  ],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const financialData = ctx.tools.get("tool_financial_data")
    if (!financialData) throw new SkillBlockedError("Financial Data tool is not registered on this worker.")
    ctx.emit("tool_called", { tool: financialData.id, toolName: financialData.name, action: "getCashFlowHistory" })
    const historyAction = financialData.actions.find((a) => a.id === "getCashFlowHistory")!
    const historyResult = await runToolAction<{ weeks: unknown[]; asOfDate: string }>(financialData.id, financialData.name, historyAction, {}, toolCtx)
    if (!historyResult.ok) {
      if (historyResult.blocked) throw new SkillBlockedError(historyResult.blockedReason ?? "Financial Data is blocked.")
      throw new ProviderError(historyResult.error ?? "Cash flow history lookup failed.")
    }
    const history = historyResult.data!
    ctx.emit("tool_completed", { tool: financialData.id, durationMs: historyResult.durationMs, weekCount: history.weeks.length })

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, "cash forecast liquidity")
    const knowledgeBlock = knowledge.length ? `\n\nInternal knowledge provided by the operator:\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}` : ""
    const prompt = `As of ${history.asOfDate}, here is the real 13-week cash flow history, plus current totals:\n${JSON.stringify(history.weeks, null, 2)}\n\nTotal open receivables: ${totalReceivables()}\nTotal open payables: ${totalPayables()}${knowledgeBlock}\n\nProject genuine near-term liquidity findings from this trend.`
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
      summary: renderFinancialFindingsSummary(parsed, "No near-term liquidity risk was identified from the current (demo) cash flow trend."),
      sources: [{ title: "Demo Financial Ledger — 13-Week Cash Flow", url: "internal://demo-ledger/cash-flow-history", provider: "Demo Financial Ledger", snippet: `${history.weeks.length} weeks of history` }],
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
    const ledgerNumbers = DEMO_CASH_FLOW_HISTORY.flatMap((w) => [w.inflow, w.outflow, w.netChange, w.endingBalance]).concat(totalReceivables(), totalPayables())
    return evaluateFinancialFindings(payload, ledgerNumbers, 1)
  },

  metrics: (result, evaluation) => {
    const emissions = financialOperationalMetrics(result, evaluation, { analyzedLabel: "weeks_forecasted", analyzedCount: DEMO_CASH_FLOW_HISTORY.length })
    // Forecast accuracy is only ever measurable in hindsight (compare a
    // past forecast to what actually happened) — this codebase has no
    // reconciliation loop yet (that is Phase J: Verified Value), so this
    // skill deliberately does NOT emit a forecast_accuracy business
    // metric it cannot yet honestly back. Emitting only what's real.
    return emissions as MetricEmission[]
  },
}

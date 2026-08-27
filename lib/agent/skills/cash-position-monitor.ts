import "server-only"

/* ================================================================== *
 * SKILL: CASH POSITION MONITOR — real LLM reasoning over a demo,
 * clearly fictional financial ledger (lib/agent/data/demo-financial-
 * ledger.ts). Same end-to-end shape as the marketing skills:
 *
 *   Financial Data tool (demo, deterministic) -> real structured facts
 *   LLM (real Anthropic/Gemini call)          -> genuine findings
 *   Evaluator                                  -> real structural scoring
 *
 * Honest scope: this monitors CURRENT cash position and flags visible
 * risk (concentration in one account, idle low-yield reserves) — it
 * does not forecast (see cash-forecast.ts) and it never moves money;
 * tool_financial_data is read-only.
 * ================================================================== */

import { DEMO_BANK_ACCOUNTS, totalCashPosition } from "@/lib/agent/data/demo-financial-ledger"
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

const SYSTEM_PROMPT = `You are a treasury analyst monitoring a company's cash position. You are given REAL account balances and must identify genuine risks or observations visible in them — concentration in a single account or bank, idle cash sitting in a low-yield reserve, a balance that looks thin relative to near-term obligations. Never invent a balance, account, or number not given to you.

${FINANCIAL_FINDINGS_SCHEMA_PROMPT}`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.behaviors.length) extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

export const cashPositionMonitorSkill: SkillDefinition = {
  id: "skill_cash_position_monitor",
  name: "Cash Position Monitor",
  description: "Reviews real (demo) bank balances and uses an LLM to flag genuine concentration and idle-cash risk.",
  category: "finance",
  outputType: "cash_position_summary",
  taskTitle: "Monitor cash position",
  riskLevel: "low",
  version: "1.0",
  status: "beta", // real, but reasoning only over demo data so far — no real financial system connected
  inputs: [],
  requiredTools: ["tool_financial_data", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: [
    "Every finding must cite a real balance or account from the demo ledger.",
    "Never claim a payment or transfer was made — this skill only reads balances.",
    "Never present a demo-ledger figure as a real bank balance.",
  ],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const financialData = ctx.tools.get("tool_financial_data")
    if (!financialData) throw new SkillBlockedError("Financial Data tool is not registered on this worker.")
    ctx.emit("tool_called", { tool: financialData.id, toolName: financialData.name, action: "getCashPosition" })
    const action = financialData.actions.find((a) => a.id === "getCashPosition")!
    const result = await runToolAction<{ accounts: unknown[]; totalCash: number; idleAccounts: unknown[]; asOfDate: string }>(
      financialData.id,
      financialData.name,
      action,
      {},
      toolCtx,
    )
    if (!result.ok) {
      if (result.blocked) throw new SkillBlockedError(result.blockedReason ?? "Financial Data is blocked.")
      throw new ProviderError(result.error ?? "Financial data lookup failed.")
    }
    const data = result.data!
    ctx.emit("tool_completed", { tool: financialData.id, durationMs: result.durationMs, accountCount: data.accounts.length })

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, "cash position")
    const knowledgeBlock = knowledge.length ? `\n\nInternal knowledge provided by the operator:\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}` : ""
    const prompt = `As of ${data.asOfDate}, here is the real account data:\n${JSON.stringify(data, null, 2)}${knowledgeBlock}\n\nIdentify genuine cash-position findings from this data.`
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
      summary: renderFinancialFindingsSummary(parsed, "No cash-position risks were identified from the current (demo) balances."),
      sources: [{ title: "Demo Financial Ledger — Cash Accounts", url: "internal://demo-ledger/cash-position", provider: "Demo Financial Ledger", snippet: `${data.accounts.length} accounts, total ${data.totalCash}` }],
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
    const ledgerNumbers = DEMO_BANK_ACCOUNTS.map((a) => a.balance).concat(totalCashPosition())
    return evaluateFinancialFindings(payload, ledgerNumbers, 1)
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as FinancialFindingsPayload
    const emissions = financialOperationalMetrics(result, evaluation, { analyzedLabel: "accounts_analyzed", analyzedCount: 3 })
    const risk = economicImpactMetric(payload, "liquidity_risk_exposure", "risk_exposure_reduced", "$")
    return risk ? [...emissions, risk] : emissions
  },
}

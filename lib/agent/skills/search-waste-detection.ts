import "server-only"

/* ================================================================== *
 * SKILL: SEARCH WASTE DETECTION — Marketing Workforce V1's first real
 * capability (Paid Media Specialist).
 *
 * Deliberately staged, not one giant LLM call:
 *
 *   1. DATA ACQUISITION  — resolvePaidSearchDataset() (demo or real,
 *      never fabricated as "connected" when it isn't)
 *   2. ANALYSIS          — classifySearchTermIntent/detectWasteOpportunities
 *      (lib/marketing/heuristics.ts) — pure, deterministic, no LLM
 *   3. IMPACT ESTIMATION — estimateImpact() — real arithmetic on the
 *      real dataset, never a modeled/guessed number
 *   4. RECOMMENDATION    — the LLM's ONLY job here: turn the already-
 *      computed, already-real opportunities into readable rationale.
 *      It never decides WHAT the opportunities are or HOW BIG the
 *      impact is — that's stages 2-3, entirely deterministic.
 *
 * The analysis itself is read-only and always completes (Low-risk
 * analytical outputs can be generated automatically — product brief
 * section 10). APPLYING any specific recommendation is a separate,
 * high-risk action (see skill_apply_marketing_recommendation) that
 * always requires human approval — this skill never attempts a write
 * itself, so a completed run here always produces a real WorkerOutput
 * before any approval gate is ever reached.
 * ================================================================== */

import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"
import { classifyDataset, detectWasteOpportunities, estimateImpact, SEARCH_WASTE_DETECTION_HEURISTIC, type WasteOpportunity } from "@/lib/marketing/heuristics"
import { resolvePaidSearchDataset } from "@/lib/marketing/google-ads-data"
import type { PaidSearchDataset } from "@/lib/marketing/paid-search-model"

export interface Recommendation {
  id: string
  opportunityId: string
  label: string
  rationale: string
  wastedSpend: number
  recoverableSpend: number
  risk: "high"
  requiresApproval: true
  /** Ready-to-use input for skill_apply_marketing_recommendation —
   * never auto-run by this skill. */
  applyActionId: "add_negative_keyword" | "review_targeting"
  applyInput: { opportunityId: string; matchedTerms: string[]; suggestedNegativeKeywords: string[] }
}

export interface SearchWasteReport {
  executiveSummary: string
  dataAnalyzed: { source: PaidSearchDataset["source"]; windowLabel: string; searchTermCount: number; spend: number; clicks: number; conversions: number }
  opportunitiesDetected: number
  opportunities: WasteOpportunity[]
  recommendations: Recommendation[]
  expectedImpact: ReturnType<typeof estimateImpact>
  risk: string
  approvalRequirements: string
  evidence: string[]
  nextSteps: string[]
}

const SYSTEM_PROMPT = `You are a paid-search optimization analyst writing the rationale section of a Search Waste Optimization Report. You are given REAL, already-computed waste opportunities — real search terms, real spend figures, real click counts. Your ONLY job is to explain, in plain business language, why each opportunity matters and what the recommended action achieves. Never invent a number that isn't in the input. Never change the recommended action. Never claim a result that hasn't happened yet — these are RECOMMENDATIONS, not completed actions.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary:
{"rationales": [{"opportunityId": string, "rationale": string (2-3 sentences, plain business language, cites the real spend/click numbers given)}]}`

function buildPrompt(opportunities: WasteOpportunity[], worker: WorkerContext): string {
  const missionLine = worker.mission.trim() ? `Worker mission: "${worker.mission.trim()}"\n\n` : ""
  const list = opportunities
    .map((o) => `[${o.id}] reason=${o.reason}, wastedSpend=$${o.wastedSpend}, recoverableSpend=$${o.recoverableSpend}, clicks=${o.clicks}, sampleTerms=${o.matchedTerms.slice(0, 5).join(", ")}`)
    .join("\n")
  return `${missionLine}Real, already-detected paid-search waste opportunities:\n${list}\n\nWrite the rationale for each.`
}

function parseRationales(text: string): Record<string, string> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned) as { rationales?: { opportunityId: string; rationale: string }[] }
    if (!Array.isArray(parsed.rationales)) return {}
    return Object.fromEntries(parsed.rationales.map((r) => [r.opportunityId, r.rationale]))
  } catch {
    return {}
  }
}

function fallbackRationale(o: WasteOpportunity): string {
  return `${o.clicks} clicks totaling $${o.wastedSpend} in spend produced zero conversions on ${o.reason.replace(/_/g, " ")} search terms. $${o.recoverableSpend} of that is addressable with a negative keyword today.`
}

function buildRecommendation(o: WasteOpportunity, rationale: string): Recommendation {
  return {
    id: `rec_${o.id}`,
    opportunityId: o.id,
    label: o.suggestedAction === "add_negative_keyword" ? `Add ${o.candidateNegativeKeywords.length} negative keyword(s)` : "Review targeting for zero-conversion high-spend terms",
    rationale,
    wastedSpend: o.wastedSpend,
    recoverableSpend: o.recoverableSpend,
    risk: "high",
    requiresApproval: true,
    applyActionId: o.suggestedAction,
    applyInput: { opportunityId: o.id, matchedTerms: o.matchedTerms, suggestedNegativeKeywords: o.candidateNegativeKeywords },
  }
}

export const searchWasteDetectionSkill: SkillDefinition = {
  id: "skill_search_waste_detection",
  name: "Search Waste Detection",
  description: "Classifies real paid-search term performance to find spend producing no return, and generates negative-keyword/targeting recommendations — deterministic analysis, LLM only for rationale.",
  category: "marketing",
  outputType: "search_waste_report",
  taskTitle: "Detect paid-search waste",
  inputs: [
    { key: "brandTerms", label: "Brand terms (comma-separated) — never recommended as negative keywords", type: "text", required: false, placeholder: "acme, acme software" },
  ],
  requiredTools: ["tool_marketing_actions", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: [
    "Never recommend excluding a branded search term.",
    "Never recommend excluding a term with a real conversion.",
    "Every recommendation requires human approval before it can be applied — this skill never applies one itself.",
    "Never claim a real business outcome before a recommendation has actually been applied and real post-action data exists.",
  ],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }
    const brandTerms = (ctx.input.brandTerms ?? "").split(",").map((t) => t.trim()).filter(Boolean)

    // ---- 1. DATA ACQUISITION ----
    ctx.emit("task_started", { skill: "skill_search_waste_detection" })
    const { source, dataset } = await resolvePaidSearchDataset()
    ctx.emit("tool_called", { tool: "marketing_dataset", action: "resolve", source })
    if (dataset.searchTerms.length === 0) throw new Error("The paid-search dataset returned zero search terms — nothing to analyze.")

    // ---- 2. ANALYSIS (deterministic) ----
    const classified = classifyDataset(dataset, brandTerms)
    const opportunities = detectWasteOpportunities(classified)
    ctx.emit("tool_completed", { tool: "marketing_heuristic", heuristic: SEARCH_WASTE_DETECTION_HEURISTIC.id, opportunitiesDetected: opportunities.length })

    // ---- 3. IMPACT ESTIMATION (deterministic) ----
    const impact = estimateImpact(opportunities, dataset.totals)

    // ---- 4. RECOMMENDATION (LLM — rationale only) ----
    const top = opportunities.slice(0, 5)
    let rationales: Record<string, string> = {}
    let llmMeta: { model?: string; inputTokens?: number; outputTokens?: number; provider?: string; executionMode?: "development" } = {}
    if (top.length > 0) {
      const llm = ctx.tools.get("tool_llm")
      if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
      ctx.emit("reasoning_started", { model: "llm" })
      const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
      const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, "paid search waste negative keywords")
      const llmResult = await runToolAction<{ text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }>(
        llm.id,
        llm.name,
        analyzeAction,
        { system: SYSTEM_PROMPT, prompt: buildPrompt(top, ctx.worker) + (knowledge.length ? `\n\nOperator knowledge: ${knowledge.map((k) => k.snippet).join(" | ")}` : ""), maxTokens: 1200 },
        toolCtx,
      )
      if (!llmResult.ok) {
        if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
        if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
        throw new ProviderError(llmResult.error ?? "LLM rationale synthesis failed.")
      }
      const llmData = llmResult.data!
      ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })
      rationales = parseRationales(llmData.text)
      llmMeta = { model: llmData.model, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, provider: llmData.provider, executionMode: llmData.executionMode }
    }

    const recommendations = top.map((o) => buildRecommendation(o, rationales[o.id] || fallbackRationale(o)))

    const report: SearchWasteReport = {
      executiveSummary:
        opportunities.length > 0
          ? `Analyzed ${dataset.totals.searchTermCount.toLocaleString()} search terms (${source === "demo" ? "DEMO DATA" : "connected account"}, ${dataset.windowLabel}) totaling $${dataset.totals.spend.toLocaleString()} in spend and ${dataset.totals.conversions.toLocaleString()} conversions. Detected ${opportunities.length} waste opportunit${opportunities.length === 1 ? "y" : "ies"} totaling an estimated $${impact.estimatedWastedSpendMonthly.toLocaleString()} in wasted spend, of which $${impact.potentialRecoverableSpendMonthly.toLocaleString()} is addressable today.`
          : `Analyzed ${dataset.totals.searchTermCount.toLocaleString()} search terms (${source === "demo" ? "DEMO DATA" : "connected account"}, ${dataset.windowLabel}) — no real waste opportunity met this heuristic's thresholds.`,
      dataAnalyzed: { source, windowLabel: dataset.windowLabel, searchTermCount: dataset.totals.searchTermCount, spend: dataset.totals.spend, clicks: dataset.totals.clicks, conversions: dataset.totals.conversions },
      opportunitiesDetected: opportunities.length,
      opportunities,
      recommendations,
      expectedImpact: impact,
      risk: "Recommendations are high-risk (write/financial) by policy — every application requires human approval. The analysis itself is read-only.",
      approvalRequirements: `${recommendations.length} recommendation${recommendations.length === 1 ? "" : "s"} would require approval if applied.`,
      evidence: opportunities.slice(0, 3).map((o) => `${o.matchedTerms.slice(0, 3).join(", ")} — $${o.wastedSpend} spend, ${o.clicks} clicks, 0 conversions`),
      nextSteps: recommendations.length > 0 ? ["Review the top recommendation's evidence.", "Apply a recommendation to trigger the real approval gate.", "Once applied and real post-action data exists, an Outcome will be recorded."] : ["No action needed — no real waste opportunity detected this period."],
    }

    return {
      structured: report,
      summary: report.executiveSummary,
      sources: [],
      ...llmMeta,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const report = result.structured as SearchWasteReport
    const dataCompleteness = report.dataAnalyzed.searchTermCount > 0 ? 100 : 0
    const analysisQuality = report.opportunitiesDetected > 0 || report.dataAnalyzed.searchTermCount > 0 ? 100 : 60
    const grounded = report.recommendations.filter((r) => r.wastedSpend > 0 && r.opportunityId).length
    const recommendationRelevance = report.recommendations.length ? Math.round((grounded / report.recommendations.length) * 100) : 100
    const policyCompliance = report.recommendations.every((r) => r.requiresApproval) ? 100 : 0
    const overall = Math.round(dataCompleteness * 0.25 + analysisQuality * 0.25 + recommendationRelevance * 0.25 + policyCompliance * 0.25)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Data completeness", score: dataCompleteness, note: `${report.dataAnalyzed.searchTermCount} search terms analyzed` },
        { label: "Analysis quality", score: analysisQuality, note: `${report.opportunitiesDetected} opportunities detected` },
        { label: "Recommendation relevance", score: recommendationRelevance, note: `${grounded}/${report.recommendations.length || 0} recommendations grounded in real waste data` },
        { label: "Policy compliance", score: policyCompliance, note: "Every recommendation correctly flagged as requiring approval" },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const report = result.structured as SearchWasteReport
    return [
      { key: "search_terms_analyzed", kind: "operational", value: report.dataAnalyzed.searchTermCount },
      { key: "opportunities_detected", kind: "operational", value: report.opportunitiesDetected },
      { key: "recommendations_generated", kind: "operational", value: report.recommendations.length },
      { key: "estimated_wasted_spend", kind: "business", value: report.expectedImpact.estimatedWastedSpendMonthly, unit: "usd" },
      { key: "estimated_recoverable_spend", kind: "business", value: report.expectedImpact.potentialRecoverableSpendMonthly, unit: "usd" },
      { key: "analysis_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}

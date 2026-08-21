import "server-only"

/* ================================================================== *
 * SKILL: TREND RESEARCH — the one fully real, end-to-end skill.
 *
 *   Web Search (real, keyless) -> real sources
 *   LLM (real Anthropic call)  -> structured, ranked trend analysis
 *   Evaluator                  -> real structural scoring, no random()
 *   Metrics                    -> operational + quality only; no
 *                                  business/revenue number is invented
 *
 * If Web Search or the LLM cannot run, this throws SkillBlockedError
 * with the exact reason — it never substitutes a fabricated result.
 * ================================================================== */

import type { SkillDefinition, SkillEvaluation, SkillExecutionResult } from "@/lib/agent/types"
import { SkillBlockedError } from "@/lib/agent/types"

interface TrendItem {
  name: string
  rank: number
  why_it_matters: string
  confidence: number
  source_indices: number[]
}

interface TrendsPayload {
  query: string
  trends: TrendItem[]
}

const SYSTEM_PROMPT = `You are a marketing intelligence analyst working for a growth team. You are given a set of REAL, current search results and must identify genuine trends visible in them — never invent a trend that is not supported by the sources you were given.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"trends":[{"name": string, "rank": number, "why_it_matters": string (2-3 sentences), "confidence": number (0-100), "source_indices": number[] (0-based indices into the provided source list that support this trend)}]}

Identify between 3 and 6 trends, ranked by importance (rank 1 = most important). Every trend must cite at least one source_index. If the sources do not support any clear trend, return an empty trends array rather than inventing one.`

function buildPrompt(query: string, sources: { title: string; url: string; snippet?: string }[]): string {
  const list = sources.map((s, i) => `[${i}] ${s.title} — ${s.snippet ?? "(no description)"} (${s.url})`).join("\n")
  return `Research question: "${query}"\n\nReal sources found via web search:\n${list}\n\nIdentify the most important trends visible in these real sources.`
}

function parseTrends(text: string, query: string): TrendsPayload | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || !Array.isArray(parsed.trends)) return null
    return { query, trends: parsed.trends }
  } catch {
    return null
  }
}

function renderSummary(payload: TrendsPayload, sources: { title: string; url: string }[]): string {
  if (payload.trends.length === 0) return `No clear trends were identified for "${payload.query}" from the available sources.`
  return payload.trends
    .sort((a, b) => a.rank - b.rank)
    .map((t) => {
      const cited = t.source_indices.map((i) => sources[i]?.title).filter(Boolean)
      return `${t.rank}. ${t.name} (confidence ${t.confidence}%)\n${t.why_it_matters}\nSources: ${cited.join(", ") || "—"}`
    })
    .join("\n\n")
}

export const trendResearchSkill: SkillDefinition = {
  id: "skill_trend_research",
  name: "Trend Research",
  description: "Searches real sources and uses an LLM to identify, rank and explain genuine trends.",
  category: "research",
  outputType: "trend_report",
  taskTitle: "Research trends",
  inputs: [
    { key: "query", label: "What should it research?", type: "text", required: true, placeholder: "The most important trends in AI agents today" },
  ],
  requiredTools: ["tool_web_search", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: ["Every trend must cite a real source.", "Never report a trend with zero supporting sources."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const query = ctx.input.query?.trim() || "the most important current trends"
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const search = ctx.tools.get("tool_web_search")
    if (!search) throw new SkillBlockedError("Web Search tool is not registered on this worker.")
    ctx.emit("tool_called", { tool: search.id, toolName: search.name, action: "search", input: { query } })
    const searchAction = search.actions.find((a) => a.id === "search")!
    const searchResult = await searchAction.run({ query, limit: 10 }, toolCtx)
    if (!searchResult.ok) {
      if (searchResult.blocked) throw new SkillBlockedError(searchResult.blockedReason ?? "Web Search is blocked.")
      throw new Error(searchResult.error ?? "Web search failed.")
    }
    const searchData = searchResult.data as { results: { title: string; url: string; provider: string; snippet?: string }[] }
    ctx.emit("tool_completed", { tool: search.id, durationMs: searchResult.durationMs, resultCount: searchData.results.length })
    if (searchData.results.length === 0) throw new Error(`Web search returned zero results for "${query}".`)

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const llmResult = await analyzeAction.run({ system: SYSTEM_PROMPT, prompt: buildPrompt(query, searchData.results), maxTokens: 2000 }, toolCtx)
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      throw new Error(llmResult.error ?? "LLM analysis failed.")
    }
    const llmData = llmResult.data as { text: string; model: string; inputTokens: number; outputTokens: number }
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens })

    const parsed = parseTrends(llmData.text, query)
    if (!parsed) throw new Error("The LLM response was not valid structured trend data.")

    return {
      structured: parsed,
      summary: renderSummary(parsed, searchData.results),
      sources: searchData.results,
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const trends = ((result.structured as TrendsPayload).trends ?? []) as TrendItem[]
    const countScore = Math.min(100, (trends.length / 3) * 100)
    const grounded = trends.filter((t) => Array.isArray(t.source_indices) && t.source_indices.length > 0).length
    const groundingScore = trends.length ? (grounded / trends.length) * 100 : 0
    const reasoned = trends.filter((t) => typeof t.why_it_matters === "string" && t.why_it_matters.length > 20).length
    const reasoningScore = trends.length ? (reasoned / trends.length) * 100 : 0
    const overall = Math.round(countScore * 0.3 + groundingScore * 0.4 + reasoningScore * 0.3)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Trend count", score: Math.round(countScore), note: `${trends.length} trends identified` },
        { label: "Source grounding", score: Math.round(groundingScore), note: `${grounded}/${trends.length || 0} trends cite a real source` },
        { label: "Reasoning depth", score: Math.round(reasoningScore), note: `${reasoned}/${trends.length || 0} trends have a substantive explanation` },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const trends = ((result.structured as TrendsPayload).trends ?? []) as TrendItem[]
    return [
      { key: "sources_analyzed", kind: "operational", value: result.sources.length },
      { key: "trends_identified", kind: "operational", value: trends.length },
      { key: "analysis_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}

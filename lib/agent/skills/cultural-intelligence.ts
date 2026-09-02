import "server-only"

/* ================================================================== *
 * SKILL: CULTURAL INTELLIGENCE — WORLD -> OPPORTUNITY, real end-to-end,
 * same shape as Trend Research:
 *
 *   Web Search (real, keyless) -> real sources
 *   LLM (real Anthropic/Gemini call) -> structured signal extraction
 *   Opportunity Engine (pure, deterministic) -> scored opportunities
 *   Evaluator                  -> real structural scoring, no random()
 *
 * This is the Marketing Super Agent's Cultural/Trend Intelligence
 * Worker role (section 2/4). It does not assume TREND = OPPORTUNITY —
 * every signal it identifies is run through lib/marketing/opportunity-
 * engine.ts's real, deterministic scoreOpportunity() before this
 * skill returns, so "why now / why this brand / why this audience" is
 * answered by a real number, not a second LLM guess.
 * ================================================================== */

import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"
import { scoreOpportunity } from "@/lib/marketing/opportunity-engine"
import type { CreativeOpportunity, IntelligenceReportPayload, IntelligenceSignal } from "@/lib/marketing/model"

interface RawSignal {
  topic: string
  category: string
  geography?: string | null
  velocity: number
  acceleration: number
  volume: number
  sentiment: number
  novelty: number
  confidence: number
  source_indices: number[]
}

const SYSTEM_PROMPT = `You are a cultural and market intelligence analyst. You are given REAL, current search results and must identify genuine cultural/market signals visible in them — never invent a signal that is not supported by the sources you were given.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"signals":[{"topic": string, "category": string (e.g. "culture", "technology", "consumer_behavior", "entertainment", "lifestyle"), "geography": string | null, "velocity": number (0-100, how fast this is moving right now based on the sources), "acceleration": number (0-100, is it speeding up), "volume": number (0-100, how much real discussion volume is visible across the sources), "sentiment": number (-100 to 100), "novelty": number (0-100, how new/unusual this is), "confidence": number (0-100, your confidence this is a real, current signal), "source_indices": number[] (0-based indices into the provided source list that support this signal)}]}

Identify between 3 and 8 signals. Every signal must cite at least one source_index. If the sources do not support any clear signal, return an empty signals array rather than inventing one.`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.objectives.length) extra.push(`Its current open objectives:\n${worker.objectives.map((o) => `- ${o}`).join("\n")}`)
  if (worker.behaviors.length) {
    extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  }
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

function buildPrompt(query: string, sources: { title: string; url: string; snippet?: string }[], knowledge: { name: string; snippet: string }[]): string {
  const list = sources.map((s, i) => `[${i}] ${s.title} — ${s.snippet ?? "(no description)"} (${s.url})`).join("\n")
  const knowledgeBlock = knowledge.length
    ? `\n\nInternal knowledge provided by the operator (real brand/audience context — use only where genuinely relevant):\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}`
    : ""
  return `Monitor: "${query}"\n\nReal sources found via web search:\n${list}${knowledgeBlock}\n\nIdentify the real cultural/market signals visible in these real sources.`
}

function parseSignals(text: string): RawSignal[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || !Array.isArray(parsed.signals)) return null
    return parsed.signals
  } catch {
    return null
  }
}

function renderSummary(payload: IntelligenceReportPayload): string {
  if (payload.signals.length === 0) return `No clear cultural/market signals were identified for "${payload.query}" from the available sources.`
  const open = payload.opportunities.filter((o) => o.status === "open")
  const header = `${payload.signals.length} signal${payload.signals.length === 1 ? "" : "s"} detected. ${open.length} real, brand-relevant opportunit${open.length === 1 ? "y" : "ies"} scored.\n\n`
  return (
    header +
    payload.opportunities
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .map((o) => `${o.topic} — score ${o.opportunityScore}${o.status === "rejected" ? " (REJECTED)" : ""}\n${o.rationale}`)
      .join("\n\n")
  )
}

export const culturalIntelligenceSkill: SkillDefinition = {
  id: "skill_cultural_intelligence",
  name: "Cultural Intelligence",
  description: "Searches real sources, identifies genuine cultural/market signals, and scores each one into a real, brand-relevance-checked opportunity — trend velocity alone is never treated as a reason to create.",
  category: "research",
  outputType: "intelligence_report",
  taskTitle: "Scan for cultural and market signals",
  inputs: [{ key: "query", label: "What cultural or market space should it monitor?", type: "text", required: true, placeholder: "Consumer trends among Gen Z in short-form video" }],
  requiredTools: ["tool_web_search", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: ["Every signal must cite a real source.", "A signal is never converted to an opportunity by trend velocity alone — brand and audience relevance are always checked."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const query = ctx.input.query?.trim() || "current cultural and market signals"
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const search = ctx.tools.get("tool_web_search")
    if (!search) throw new SkillBlockedError("Web Search tool is not registered on this worker.")
    ctx.emit("tool_called", { tool: search.id, toolName: search.name, action: "search", input: { query } })
    const searchAction = search.actions.find((a) => a.id === "search")!
    const searchResult = await runToolAction<{ results: { title: string; url: string; provider: string; snippet?: string }[] }>(
      search.id,
      search.name,
      searchAction,
      { query, limit: 10 },
      toolCtx,
    )
    if (!searchResult.ok) {
      if (searchResult.blocked) throw new SkillBlockedError(searchResult.blockedReason ?? "Web Search is blocked.")
      throw new ProviderError(searchResult.error ?? "Web search failed.")
    }
    const searchData = searchResult.data as { results: { title: string; url: string; provider: string; snippet?: string }[] }
    ctx.emit("tool_completed", { tool: search.id, durationMs: searchResult.durationMs, resultCount: searchData.results.length })
    if (searchData.results.length === 0) throw new Error(`Web search returned zero results for "${query}".`)

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, query)
    const llmResult = await runToolAction<{ text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }>(
      llm.id,
      llm.name,
      analyzeAction,
      { system: buildSystemPrompt(ctx.worker), prompt: buildPrompt(query, searchData.results, knowledge), maxTokens: 2400 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM analysis failed.")
    }
    const llmData = llmResult.data as { text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })

    const rawSignals = parseSignals(llmData.text)
    if (!rawSignals) throw new Error("The LLM response was not valid structured signal data.")

    const signals: IntelligenceSignal[] = rawSignals.map((s, i) => ({
      id: `sig_${ctx.executionId}_${i}`,
      source: "web_search",
      topic: s.topic,
      category: s.category,
      geography: s.geography ?? undefined,
      velocity: s.velocity,
      acceleration: s.acceleration,
      volume: s.volume,
      sentiment: s.sentiment,
      novelty: s.novelty,
      marketRelevance: 0, // filled in below, after brandContext is known
      trendScore: Math.round((s.velocity + s.novelty + s.confidence) / 3),
      confidence: s.confidence,
      sourceUrl: s.source_indices?.map((idx) => searchData.results[idx]?.url).find(Boolean),
      sourceIndices: s.source_indices ?? [],
    }))

    // Real brand/audience grounding — this worker's own mission,
    // objectives, and retrieved Domain Profile knowledge (the exact
    // same real context every other skill already uses).
    const brandContext = [ctx.worker.mission, ...ctx.worker.objectives].join(" ")
    const audienceContext = knowledge.map((k) => k.snippet).join(" ")

    const opportunities: CreativeOpportunity[] = signals.map((sig) => scoreOpportunity(sig, brandContext, audienceContext))
    for (let i = 0; i < signals.length; i++) signals[i].marketRelevance = opportunities[i].brandRelevance

    const payload: IntelligenceReportPayload = { query, signals, opportunities }

    return {
      structured: payload,
      summary: renderSummary(payload),
      sources: searchData.results,
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      provider: llmData.provider,
      executionMode: llmData.executionMode,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const payload = result.structured as IntelligenceReportPayload
    const countScore = Math.min(100, (payload.signals.length / 3) * 100)
    const grounded = payload.signals.filter((s) => s.sourceIndices.length > 0).length
    const groundingScore = payload.signals.length ? (grounded / payload.signals.length) * 100 : 0
    const openOpportunities = payload.opportunities.filter((o) => o.status === "open").length
    const opportunityScore = payload.signals.length ? (openOpportunities / payload.signals.length) * 100 : 0
    const overall = Math.round(countScore * 0.3 + groundingScore * 0.4 + opportunityScore * 0.3)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Signals detected", score: Math.round(countScore), note: `${payload.signals.length} signals identified` },
        { label: "Source grounding", score: Math.round(groundingScore), note: `${grounded}/${payload.signals.length || 0} signals cite a real source` },
        { label: "Opportunity yield", score: Math.round(opportunityScore), note: `${openOpportunities}/${payload.signals.length || 0} signals scored as a real opportunity` },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as IntelligenceReportPayload
    const open = payload.opportunities.filter((o) => o.status === "open").length
    return [
      { key: "sources_analyzed", kind: "operational", value: result.sources.length },
      { key: "signals_detected", kind: "operational", value: payload.signals.length },
      { key: "opportunities_scored", kind: "business", value: open },
      { key: "signal_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}

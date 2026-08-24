import "server-only"

/* ================================================================== *
 * SKILL: SEO OPPORTUNITY PLANNING — real, end-to-end, same shape as
 * Trend Research / Lead Qualification:
 *
 *   Web Search (real, keyless) -> real topic/competitor signals
 *   LLM (real Anthropic/Gemini call) -> structured page-opportunity plan
 *   Evaluator                  -> real structural scoring, no random()
 *
 * This is the Programmatic SEO product's core capability. Its honest,
 * real scope is OPPORTUNITY IDENTIFICATION + PAGE PLANNING: it finds
 * real topic signals and turns them into a structured brief per
 * opportunity (title, intent, outline). It does not claim to have
 * real keyword-volume/rank data (that needs Search Console / a rank
 * tracker — see the product's notYetConnected list) and it does not
 * publish anything — no CMS write access exists.
 * ================================================================== */

import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"

interface SeoOpportunity {
  topic: string
  target_intent: string
  suggested_title: string
  outline: string[]
  confidence: number
  source_indices: number[]
}

interface SeoOpportunityPayload {
  query: string
  opportunities: SeoOpportunity[]
}

const SYSTEM_PROMPT = `You are a programmatic SEO strategist. You are given REAL, current search results and must identify genuine page/topic opportunities visible in them — never invent an opportunity that is not supported by the sources you were given. You have no real keyword-volume or rank-tracking data; do not invent search-volume numbers.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"opportunities":[{"topic": string, "target_intent": string (who is searching this and why, 1 sentence), "suggested_title": string (a real page title), "outline": string[] (3-6 section headings for the page), "confidence": number (0-100), "source_indices": number[] (0-based indices into the provided source list that support this opportunity)}]}

Identify between 3 and 6 opportunities. Every opportunity must cite at least one source_index. If the sources do not support any real opportunity, return an empty array rather than inventing one.`

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
    ? `\n\nInternal knowledge provided by the operator (this may describe the site's real business, audience, existing pages, and rules — use it to keep opportunities relevant and on-brand):\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}`
    : ""
  return `Site focus / topic area: "${query}"\n\nReal sources found via web search:\n${list}${knowledgeBlock}\n\nIdentify real page/topic opportunities visible in these sources and plan a page for each.`
}

function parseOpportunities(text: string, query: string): SeoOpportunityPayload | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || !Array.isArray(parsed.opportunities)) return null
    return { query, opportunities: parsed.opportunities }
  } catch {
    return null
  }
}

function renderSummary(payload: SeoOpportunityPayload, sources: { title: string; url: string }[]): string {
  if (payload.opportunities.length === 0) return `No real page opportunities were identified for "${payload.query}" from the available sources.`
  return payload.opportunities
    .sort((a, b) => b.confidence - a.confidence)
    .map((o) => {
      const cited = o.source_indices.map((i) => sources[i]?.title).filter(Boolean)
      return `${o.suggested_title} (confidence ${o.confidence}%)\nIntent: ${o.target_intent}\nOutline: ${o.outline.join(" → ")}\nSources: ${cited.join(", ") || "—"}`
    })
    .join("\n\n")
}

export const seoOpportunitySkill: SkillDefinition = {
  id: "skill_seo_opportunity",
  name: "SEO Opportunity Planning",
  description: "Searches real sources and uses an LLM to identify genuine topic/page opportunities and produce a structured page plan.",
  category: "content",
  outputType: "seo_opportunity_plan",
  taskTitle: "Plan SEO page opportunities",
  inputs: [{ key: "query", label: "What topic area or site focus should it plan for?", type: "text", required: true, placeholder: "Comparison and how-to pages for a project management tool" }],
  requiredTools: ["tool_web_search", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: ["Every opportunity must cite a real source.", "Never invent search-volume or rank data.", "Never claim a page was published — no CMS write access exists."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const query = ctx.input.query?.trim() || "relevant page opportunities"
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
      { system: buildSystemPrompt(ctx.worker), prompt: buildPrompt(query, searchData.results, knowledge), maxTokens: 2200 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM analysis failed.")
    }
    const llmData = llmResult.data as { text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })

    const parsed = parseOpportunities(llmData.text, query)
    if (!parsed) throw new Error("The LLM response was not valid structured opportunity data.")

    return {
      structured: parsed,
      summary: renderSummary(parsed, searchData.results),
      sources: searchData.results,
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      provider: llmData.provider,
      executionMode: llmData.executionMode,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const opportunities = ((result.structured as SeoOpportunityPayload).opportunities ?? []) as SeoOpportunity[]
    const countScore = Math.min(100, (opportunities.length / 3) * 100)
    const grounded = opportunities.filter((o) => Array.isArray(o.source_indices) && o.source_indices.length > 0).length
    const groundingScore = opportunities.length ? (grounded / opportunities.length) * 100 : 0
    const outlined = opportunities.filter((o) => Array.isArray(o.outline) && o.outline.length >= 3).length
    const outlineScore = opportunities.length ? (outlined / opportunities.length) * 100 : 0
    const overall = Math.round(countScore * 0.3 + groundingScore * 0.4 + outlineScore * 0.3)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Opportunities found", score: Math.round(countScore), note: `${opportunities.length} opportunities identified` },
        { label: "Source grounding", score: Math.round(groundingScore), note: `${grounded}/${opportunities.length || 0} opportunities cite a real source` },
        { label: "Outline completeness", score: Math.round(outlineScore), note: `${outlined}/${opportunities.length || 0} opportunities have a full outline` },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const opportunities = ((result.structured as SeoOpportunityPayload).opportunities ?? []) as SeoOpportunity[]
    return [
      { key: "sources_analyzed", kind: "operational", value: result.sources.length },
      { key: "opportunities_identified", kind: "operational", value: opportunities.length },
      { key: "plan_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}

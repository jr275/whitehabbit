import "server-only"

/* ================================================================== *
 * SKILL: LEAD RESEARCH & QUALIFICATION — real, end-to-end, same shape
 * as Trend Research:
 *
 *   Web Search (real, keyless) -> real candidate signals
 *   LLM (real Anthropic/Gemini call) -> structured lead extraction +
 *                                        ICP qualification/scoring
 *   Evaluator                  -> real structural scoring, no random()
 *
 * This is what makes "Find high-quality enterprise leads and book
 * qualified meetings" an actually-executable Worker, not a blueprint
 * that names a job no real skill can do. There is no CRM/email tool
 * behind this yet (see the Integration Registry — those require real
 * third-party credentials this environment doesn't have), so this
 * skill's real, honest scope is RESEARCH + QUALIFICATION: it finds
 * real candidate companies and scores them against the operator's
 * criteria. It does not claim to book meetings or write to a CRM.
 * ================================================================== */

import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"

interface LeadCandidate {
  company: string
  evidence: string
  score: number
  qualified: boolean
  reasoning: string
  source_indices: number[]
}

interface LeadsPayload {
  query: string
  leads: LeadCandidate[]
}

const SYSTEM_PROMPT = `You are a B2B sales research analyst. You are given REAL, current search results and must identify genuine candidate companies visible in them that could plausibly match the requested target profile (ICP) — never invent a company that is not supported by the sources you were given.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"leads":[{"company": string, "evidence": string (1-2 sentences, what in the sources supports this being a real candidate), "score": number (0-100, how well this candidate matches the requested profile), "qualified": boolean (true only if score >= 65 AND the evidence is concrete), "reasoning": string (1-2 sentences explaining the score), "source_indices": number[] (0-based indices into the provided source list that support this candidate)}]}

Identify between 3 and 8 candidates. Every candidate must cite at least one source_index. If the sources do not support any real candidate, return an empty leads array rather than inventing one. Be conservative — a low-confidence guess should score low and be unqualified, not omitted.`

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
    ? `\n\nInternal knowledge provided by the operator (use only where genuinely relevant — this may describe the ideal customer profile):\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}`
    : ""
  return `Target profile / request: "${query}"\n\nReal sources found via web search:\n${list}${knowledgeBlock}\n\nIdentify real candidate companies visible in these sources and score how well each matches the target profile.`
}

function parseLeads(text: string, query: string): LeadsPayload | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || !Array.isArray(parsed.leads)) return null
    return { query, leads: parsed.leads }
  } catch {
    return null
  }
}

function renderSummary(payload: LeadsPayload, sources: { title: string; url: string }[]): string {
  if (payload.leads.length === 0) return `No real candidates were identified for "${payload.query}" from the available sources.`
  const qualified = payload.leads.filter((l) => l.qualified)
  const header = `${qualified.length}/${payload.leads.length} candidates qualified.\n\n`
  return (
    header +
    payload.leads
      .sort((a, b) => b.score - a.score)
      .map((l) => {
        const cited = l.source_indices.map((i) => sources[i]?.title).filter(Boolean)
        return `${l.company} — score ${l.score}${l.qualified ? " (QUALIFIED)" : ""}\n${l.evidence}\n${l.reasoning}\nSources: ${cited.join(", ") || "—"}`
      })
      .join("\n\n")
  )
}

export const leadQualificationSkill: SkillDefinition = {
  id: "skill_lead_qualification",
  name: "Lead Research & Qualification",
  description: "Searches real sources and uses an LLM to identify and score genuine candidate companies against a target profile.",
  category: "sales",
  outputType: "lead_qualification",
  taskTitle: "Research and qualify leads",
  inputs: [
    { key: "query", label: "What kind of leads should it find?", type: "text", required: true, placeholder: "Enterprise SaaS companies expanding into new markets" },
  ],
  requiredTools: ["tool_web_search", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: ["Every candidate must cite a real source.", "Never report a candidate with zero supporting sources.", "A candidate is never marked qualified without concrete evidence."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const query = ctx.input.query?.trim() || "companies matching the target profile"
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
      { system: buildSystemPrompt(ctx.worker), prompt: buildPrompt(query, searchData.results, knowledge), maxTokens: 2000 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM analysis failed.")
    }
    const llmData = llmResult.data as { text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })

    const parsed = parseLeads(llmData.text, query)
    if (!parsed) throw new Error("The LLM response was not valid structured lead data.")

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
    const leads = ((result.structured as LeadsPayload).leads ?? []) as LeadCandidate[]
    const countScore = Math.min(100, (leads.length / 3) * 100)
    const grounded = leads.filter((l) => Array.isArray(l.source_indices) && l.source_indices.length > 0).length
    const groundingScore = leads.length ? (grounded / leads.length) * 100 : 0
    const reasoned = leads.filter((l) => typeof l.reasoning === "string" && l.reasoning.length > 15).length
    const reasoningScore = leads.length ? (reasoned / leads.length) * 100 : 0
    const overall = Math.round(countScore * 0.3 + groundingScore * 0.4 + reasoningScore * 0.3)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Candidates found", score: Math.round(countScore), note: `${leads.length} candidates identified` },
        { label: "Source grounding", score: Math.round(groundingScore), note: `${grounded}/${leads.length || 0} candidates cite a real source` },
        { label: "Reasoning depth", score: Math.round(reasoningScore), note: `${reasoned}/${leads.length || 0} candidates have a substantive explanation` },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const leads = ((result.structured as LeadsPayload).leads ?? []) as LeadCandidate[]
    const qualified = leads.filter((l) => l.qualified).length
    return [
      { key: "sources_analyzed", kind: "operational", value: result.sources.length },
      { key: "leads_identified", kind: "operational", value: leads.length },
      { key: "leads_qualified", kind: "business", value: qualified },
      { key: "qualification_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}

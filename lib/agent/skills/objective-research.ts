import "server-only"

/* ================================================================== *
 * SKILL: OBJECTIVE RESEARCH
 *
 *   Objective -> Tavily -> real web sources -> Gemini -> result
 *
 * An operator states an objective in their own words. The skill
 * searches the live web for it, hands the model ONLY what came back,
 * and returns a synthesis in which every discovery points at a real,
 * openable URL.
 *
 * Three things this skill will not do, each enforced in code rather
 * than asked for in the prompt:
 *
 *  1. It never invents a source. The model is given indices into a
 *     list it did not choose, and admissibleDiscoveries() DROPS any
 *     discovery whose indices do not resolve. A model that invents a
 *     citation loses the discovery, not the reader's trust.
 *  2. It never substitutes a result for a failure. No search results,
 *     no LLM, no parseable output — each throws with the real reason.
 *  3. It never talks to Gemini itself. The call goes through
 *     tool_llm -> lib/ai/llm, so whichever provider the deployment
 *     configured is the one that runs, and the token counts on the
 *     execution row are that provider's real numbers.
 * ================================================================== */

import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, SourceRecord, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"

/* ---- the output contract ------------------------------------------ */

export interface ResearchDiscovery {
  title: string
  finding: string
  /** Rank, 1 = most important. Renumbered contiguously after
   *  inadmissible discoveries are dropped, so the list a reader sees
   *  is never 1, 2, 4. */
  importance: number
  /** 0-based indices into `sources`. Guaranteed to resolve — an index
   *  that did not is why a discovery was dropped. */
  source_indices: number[]
}

export interface ObjectiveResearchPayload {
  objective: string
  answer: string
  discoveries: ResearchDiscovery[]
}

/* ---- input validation ---------------------------------------------- */

export const MIN_OBJECTIVE_CHARS = 10
export const MAX_OBJECTIVE_CHARS = 1000

/** Search results and a model call both cost something real, so a
 *  useless objective is rejected before either happens. */
export function parseObjective(raw: string | undefined): string {
  const objective = (raw ?? "").trim().replace(/\s+/g, " ")
  if (objective.length < MIN_OBJECTIVE_CHARS) {
    throw new Error(`State the research objective in at least ${MIN_OBJECTIVE_CHARS} characters.`)
  }
  if (objective.length > MAX_OBJECTIVE_CHARS) {
    throw new Error(`The research objective must be at most ${MAX_OBJECTIVE_CHARS} characters.`)
  }
  return objective
}

/* ---- prompting ------------------------------------------------------ */

const MAX_DISCOVERIES = 6
const SNIPPET_CHARS = 1200

const SYSTEM_PROMPT = `You are a research analyst. You are given a research objective and a numbered list of REAL web sources that were just retrieved for it. Your entire answer must come from those sources.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"answer": string, "discoveries": [{"title": string, "finding": string, "importance": number, "source_indices": number[]}]}

Rules you must follow:
- answer: 3-6 sentences that directly address the objective, drawn only from the provided sources.
- discoveries: between 2 and ${MAX_DISCOVERIES} distinct findings, most important first, with importance starting at 1.
- source_indices: 0-based indices into the numbered source list above. Every discovery must cite at least one.
- Never invent a source, a URL, a publication, an author or a statistic. If the sources do not support a claim, leave it out.
- Separate evidence from inference. State what the sources say as fact; when you reason beyond what they state, mark it plainly ("this suggests", "the sources do not say, but"). Never present a conclusion you drew as something a source reported.
- If the evidence is thin or the sources do not answer the objective, say exactly that in answer rather than filling the gap. Return the discoveries the sources DO support, or an empty discoveries array.`

/** Appends the real worker's mission/objectives/behavior rules — only
 *  the fields actually set. An empty worker yields the base prompt,
 *  not placeholder directives. */
function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this research has this mission: "${worker.mission.trim()}"`)
  if (worker.objectives.length) extra.push(`Its current open objectives:\n${worker.objectives.map((o) => `- ${o}`).join("\n")}`)
  if (worker.behaviors.length) {
    extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  }
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

export function buildPrompt(objective: string, sources: SourceRecord[]): string {
  const list = sources
    .map((s, i) => `[${i}] ${s.title}\n    URL: ${s.url}\n    ${(s.snippet ?? "(no extracted content)").slice(0, SNIPPET_CHARS)}`)
    .join("\n\n")
  return `Research objective: "${objective}"\n\nReal web sources retrieved for this objective:\n\n${list}\n\nAnswer the objective using only these sources.`
}

/* ---- parsing and grounding ------------------------------------------ */

interface RawDiscovery {
  title?: unknown
  finding?: unknown
  importance?: unknown
  source_indices?: unknown
}

/** Strips the markdown fence some models wrap JSON in, then parses.
 *  Returns null rather than throwing so the caller decides what an
 *  unparseable response means. */
export function parseResearch(text: string): { answer: string; discoveries: RawDiscovery[] } | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned) as { answer?: unknown; discoveries?: unknown }
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.answer !== "string") return null
    if (!Array.isArray(parsed.discoveries)) return null
    return { answer: parsed.answer.trim(), discoveries: parsed.discoveries as RawDiscovery[] }
  } catch {
    return null
  }
}

/** The grounding gate. A discovery survives only if it has real text
 *  AND at least one index that lands inside the source list we actually
 *  retrieved. Out-of-range and duplicate indices are removed; a
 *  discovery left with none is dropped entirely. */
export function admissibleDiscoveries(raw: RawDiscovery[], sourceCount: number): ResearchDiscovery[] {
  const kept: { title: string; finding: string; importance: number; source_indices: number[] }[] = []

  for (const d of raw) {
    const title = typeof d.title === "string" ? d.title.trim() : ""
    const finding = typeof d.finding === "string" ? d.finding.trim() : ""
    if (!title || !finding) continue

    const indices = Array.isArray(d.source_indices)
      ? [...new Set(d.source_indices.filter((i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < sourceCount))]
      : []
    if (indices.length === 0) continue

    kept.push({
      title,
      finding,
      importance: typeof d.importance === "number" && Number.isFinite(d.importance) ? d.importance : kept.length + 1,
      source_indices: indices.sort((a, b) => a - b),
    })
  }

  return kept
    .sort((a, b) => a.importance - b.importance)
    .slice(0, MAX_DISCOVERIES)
    .map((d, i) => ({ ...d, importance: i + 1 }))
}

function renderSummary(payload: ObjectiveResearchPayload, sources: SourceRecord[]): string {
  const head = `${payload.objective}\n\n${payload.answer}`
  if (payload.discoveries.length === 0) return `${head}\n\nNo discovery in the response was supported by the retrieved sources.`
  const body = payload.discoveries
    .map((d) => {
      const cited = d.source_indices.map((i) => sources[i]?.title).filter(Boolean)
      return `${d.importance}. ${d.title}\n${d.finding}\nSources: ${cited.join(", ")}`
    })
    .join("\n\n")
  return `${head}\n\n${body}`
}

/* ---- the skill ------------------------------------------------------ */

const SEARCH_LIMIT = 8

export const objectiveResearchSkill: SkillDefinition = {
  id: "skill_objective_research",
  name: "Objective Research",
  description: "Researches a stated objective against the live web via Tavily and synthesizes an answer grounded only in the pages it retrieved.",
  category: "research",
  outputType: "research_result",
  taskTitle: "Research an objective",
  inputs: [
    {
      key: "objective",
      label: "What should it find out?",
      type: "textarea",
      required: true,
      placeholder: "Which pricing models are B2B SaaS companies moving to in 2026, and why",
    },
  ],
  requiredTools: ["tool_tavily_search", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: [
    "Every discovery must cite at least one retrieved source.",
    "A discovery citing a source that was not retrieved is discarded, never reported.",
    "Never fabricate a URL, publication or statistic.",
  ],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const objective = parseObjective(ctx.input.objective)
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    /* ---- 1. real web sources ---- */
    const search = ctx.tools.get("tool_tavily_search")
    if (!search) throw new SkillBlockedError("Tavily Search tool is not registered on this worker.")
    ctx.emit("tool_called", { tool: search.id, toolName: search.name, action: "search", input: { query: objective } })
    const searchAction = search.actions.find((a) => a.id === "search")
    if (!searchAction) throw new SkillBlockedError("Tavily Search tool exposes no search action.")

    const searchResult = await runToolAction<{ results: SourceRecord[]; provider: string }>(
      search.id,
      search.name,
      searchAction,
      { query: objective, limit: SEARCH_LIMIT },
      toolCtx,
    )
    if (!searchResult.ok) {
      if (searchResult.blocked) throw new SkillBlockedError(searchResult.blockedReason ?? "Tavily Search is not configured.")
      if (searchResult.errorCode === "invalid_credential") throw new InvalidCredentialError(searchResult.error ?? "The configured Tavily credential was rejected.")
      throw new ProviderError(searchResult.error ?? "Tavily search failed.")
    }
    const sources = searchResult.data?.results
    if (!sources) throw new ProviderError("Tavily reported success but returned no result set.")
    ctx.emit("tool_completed", { tool: search.id, durationMs: searchResult.durationMs, resultCount: sources.length })
    if (sources.length === 0) throw new Error(`Tavily returned no sources for "${objective}".`)

    /* ---- 2. synthesis over ONLY those sources ---- */
    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")
    if (!analyzeAction) throw new SkillBlockedError("LLM tool exposes no analyze action.")

    ctx.emit("reasoning_started", { model: "llm", sourceCount: sources.length })
    const llmResult = await runToolAction<{
      text: string
      model: string
      inputTokens: number
      outputTokens: number
      provider: string
      executionMode?: "development"
    }>(
      llm.id,
      llm.name,
      analyzeAction,
      { system: buildSystemPrompt(ctx.worker), prompt: buildPrompt(objective, sources), maxTokens: 2000 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is not configured.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM synthesis failed.")
    }
    const llmData = llmResult.data
    if (!llmData?.text) throw new ProviderError("The LLM reported success but returned no text.")
    ctx.emit("reasoning_completed", {
      durationMs: llmResult.durationMs,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      executionMode: llmData.executionMode,
    })

    /* ---- 3. parse, then discard anything ungrounded ---- */
    const parsed = parseResearch(llmData.text)
    if (!parsed) throw new Error("The LLM response was not valid structured research data.")
    if (!parsed.answer) throw new Error("The LLM response contained no answer.")

    const discoveries = admissibleDiscoveries(parsed.discoveries, sources.length)
    const payload: ObjectiveResearchPayload = { objective, answer: parsed.answer, discoveries }

    return {
      structured: payload,
      summary: renderSummary(payload, sources),
      sources,
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      provider: llmData.provider,
      executionMode: llmData.executionMode,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const payload = result.structured as ObjectiveResearchPayload
    const discoveries = payload.discoveries ?? []

    const countScore = Math.min(100, (discoveries.length / 3) * 100)

    // Every surviving discovery is grounded by construction, so what
    // this measures is BREADTH of grounding: research that leans on
    // one of eight retrieved pages is weaker than research that draws
    // on several, and that difference is worth surfacing.
    const cited = new Set(discoveries.flatMap((d) => d.source_indices))
    const coverageScore = result.sources.length ? (cited.size / result.sources.length) * 100 : 0

    const substantive = discoveries.filter((d) => d.finding.length > 40).length
    const depthScore = discoveries.length ? (substantive / discoveries.length) * 100 : 0

    const answerScore = payload.answer && payload.answer.length > 80 ? 100 : payload.answer ? 50 : 0

    const overall = Math.round(countScore * 0.25 + coverageScore * 0.25 + depthScore * 0.25 + answerScore * 0.25)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Discovery count", score: Math.round(countScore), note: `${discoveries.length} discoveries returned` },
        { label: "Source coverage", score: Math.round(coverageScore), note: `${cited.size}/${result.sources.length} retrieved sources cited` },
        { label: "Finding depth", score: Math.round(depthScore), note: `${substantive}/${discoveries.length || 0} findings are substantive` },
        { label: "Answer", score: answerScore, note: payload.answer ? `${payload.answer.length} characters` : "no answer" },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as ObjectiveResearchPayload
    return [
      { key: "sources_retrieved", kind: "operational", value: result.sources.length },
      { key: "discoveries_reported", kind: "operational", value: (payload.discoveries ?? []).length },
      { key: "research_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}

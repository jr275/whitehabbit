import "server-only"

/* ================================================================== *
 * SKILL: CREATIVE TERRITORY GENERATION — OPPORTUNITY -> CREATIVE
 * (section 8/9). Real LLM call, grounded in this worker's own real
 * brand/objectives text and the given opportunity, producing exactly
 * 6 structurally distinct creative territories — never six minor
 * variations of the same idea.
 *
 * noveltyScore/brandFitScore/audienceFitScore are real, deterministic
 * computations over the LLM's own generated text (a real diversity
 * check across the batch, and the same keyword-overlap brand/audience
 * grounding lib/marketing/opportunity-engine.ts already uses) — never
 * the LLM's own self-rating, which would let a fabricated "97/100
 * brand fit" pass through unverified.
 *
 * There is no 3D/video production provider connected in this
 * deployment (section 10) — every concept's `productionStatus` is
 * honestly "not_connected", never a fabricated production run.
 * ================================================================== */

import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"
import type { CreativeConcept, CreativeConceptsPayload } from "@/lib/marketing/model"

interface RawConcept {
  title: string
  thesis: string
  hook: string
  story: string
  emotionalIntent: string
  audience: string
  brandRole: string
  productRole: string
  visualStyle: string
  world: string
  characters: string[]
  cameraLanguage: string
  duration: string
  platform: string
  cta: string
  rationale: string
}

const REQUIRED_CONCEPTS = 6

const SYSTEM_PROMPT = `You are an executive creative director. Given a real business's brand context and a specific creative opportunity, generate EXACTLY ${REQUIRED_CONCEPTS} creative territories for a campaign — each one a genuinely distinct approach, never a minor variation of another. Vary emotional territory, narrative structure and creative approach across all ${REQUIRED_CONCEPTS} (examples of distinct territories: cinematic story, surreal/impossible physics, product hero, cultural moment, comedy, emotional/aspirational — choose what's genuinely right for this opportunity, not necessarily these exact six, but never repeat the same emotionalIntent twice).

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"concepts":[{"title": string, "thesis": string (1-2 sentences: the creative strategy), "hook": string (the opening moment), "story": string (2-4 sentences), "emotionalIntent": string (one or two words, e.g. "awe", "humor", "nostalgia", "aspiration" — must be different for every concept), "audience": string, "brandRole": string (how the brand appears), "productRole": string (how the product/service appears), "visualStyle": string, "world": string (the setting), "characters": string[], "cameraLanguage": string, "duration": string (e.g. "15s", "30s"), "platform": string (e.g. "Instagram Reels", "TikTok", "YouTube"), "cta": string, "rationale": string (why this territory fits the opportunity)}]}

Generate exactly ${REQUIRED_CONCEPTS} concepts.`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.objectives.length) extra.push(`Its current open objectives:\n${worker.objectives.map((o) => `- ${o}`).join("\n")}`)
  if (worker.behaviors.length) {
    extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  }
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

function buildPrompt(opportunityTopic: string, knowledge: { name: string; snippet: string }[]): string {
  const knowledgeBlock = knowledge.length
    ? `\n\nReal brand/audience context provided by the operator:\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}`
    : ""
  return `Creative opportunity: "${opportunityTopic}"${knowledgeBlock}\n\nGenerate ${REQUIRED_CONCEPTS} genuinely distinct creative territories for this opportunity.`
}

function parseConcepts(text: string): RawConcept[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || !Array.isArray(parsed.concepts)) return null
    return parsed.concepts
  } catch {
    return null
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

function overlapScore(a: string, b: string): number {
  const aTerms = new Set(tokenize(a))
  const bTerms = new Set(tokenize(b))
  if (aTerms.size === 0 || bTerms.size === 0) return 0
  let hits = 0
  for (const t of aTerms) if (bTerms.has(t)) hits++
  return Math.round((hits / aTerms.size) * 100)
}

function renderSummary(payload: CreativeConceptsPayload): string {
  if (payload.concepts.length === 0) return `No creative territories were generated for "${payload.opportunityTopic}".`
  return payload.concepts
    .map((c, i) => `${i + 1}. ${c.title} (${c.emotionalIntent})\n${c.thesis}\nBrand fit ${c.brandFitScore}/100 · Novelty ${c.noveltyScore}/100`)
    .join("\n\n")
}

export const creativeTerritoryGenerationSkill: SkillDefinition = {
  id: "skill_creative_territory_generation",
  name: "Creative Territory Generation",
  description: `Generates exactly ${REQUIRED_CONCEPTS} genuinely distinct creative territories for a real opportunity, grounded in this worker's real brand context — never minor variations of the same idea.`,
  category: "content",
  outputType: "creative_concepts",
  taskTitle: "Generate creative territories",
  inputs: [{ key: "query", label: "Which opportunity or cultural moment should it develop creative territories for?", type: "text", required: true, placeholder: "A surge of interest in retro gaming nostalgia among 25-34 year olds" }],
  requiredTools: ["tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: [`Always exactly ${REQUIRED_CONCEPTS} concepts.`, "No two concepts may share the same emotional territory.", "Every concept's production status starts not_connected — no fabricated production run."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const opportunityTopic = ctx.input.query?.trim() || "the current creative opportunity"
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, opportunityTopic)
    const llmResult = await runToolAction<{ text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }>(
      llm.id,
      llm.name,
      analyzeAction,
      { system: buildSystemPrompt(ctx.worker), prompt: buildPrompt(opportunityTopic, knowledge), maxTokens: 3200 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM analysis failed.")
    }
    const llmData = llmResult.data as { text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })

    const rawConcepts = parseConcepts(llmData.text)
    if (!rawConcepts) throw new Error("The LLM response was not valid structured creative concept data.")

    const brandContext = [ctx.worker.mission, ...ctx.worker.objectives].join(" ")
    const audienceContext = knowledge.map((k) => k.snippet).join(" ") || brandContext

    // real, structural diversity check — a concept whose emotional
    // territory repeats within this batch is penalized, never the
    // LLM's own self-rating.
    const intentCounts = new Map<string, number>()
    for (const c of rawConcepts) intentCounts.set(c.emotionalIntent, (intentCounts.get(c.emotionalIntent) ?? 0) + 1)

    const concepts: CreativeConcept[] = rawConcepts.map((c, i) => {
      const duplicates = (intentCounts.get(c.emotionalIntent) ?? 1) - 1
      const noveltyScore = Math.max(10, 100 - duplicates * 30)
      const brandFitScore = overlapScore(`${c.thesis} ${c.brandRole} ${c.productRole}`, brandContext)
      const audienceFitScore = overlapScore(c.audience, audienceContext)
      return {
        id: `cc_${ctx.executionId}_${i}`,
        opportunityTopic,
        title: c.title,
        thesis: c.thesis,
        hook: c.hook,
        story: c.story,
        emotionalIntent: c.emotionalIntent,
        audience: c.audience,
        brandRole: c.brandRole,
        productRole: c.productRole,
        visualStyle: c.visualStyle,
        world: c.world,
        characters: Array.isArray(c.characters) ? c.characters : [],
        cameraLanguage: c.cameraLanguage,
        duration: c.duration,
        platform: c.platform,
        cta: c.cta,
        rationale: c.rationale,
        noveltyScore,
        brandFitScore,
        audienceFitScore,
        predictedPerformanceScore: Math.round((noveltyScore + brandFitScore + audienceFitScore) / 3),
        productionStatus: "not_connected",
      }
    })

    const payload: CreativeConceptsPayload = { opportunityTopic, concepts }

    return {
      structured: payload,
      summary: renderSummary(payload),
      sources: [],
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      provider: llmData.provider,
      executionMode: llmData.executionMode,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const payload = result.structured as CreativeConceptsPayload
    const countScore = payload.concepts.length === REQUIRED_CONCEPTS ? 100 : Math.min(100, (payload.concepts.length / REQUIRED_CONCEPTS) * 100)
    const distinctIntents = new Set(payload.concepts.map((c) => c.emotionalIntent)).size
    const diversityScore = payload.concepts.length ? (distinctIntents / payload.concepts.length) * 100 : 0
    const complete = payload.concepts.filter((c) => c.hook.trim() && c.story.trim()).length
    const completenessScore = payload.concepts.length ? (complete / payload.concepts.length) * 100 : 0
    const overall = Math.round(countScore * 0.3 + diversityScore * 0.4 + completenessScore * 0.3)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Concept count", score: Math.round(countScore), note: `${payload.concepts.length}/${REQUIRED_CONCEPTS} concepts generated` },
        { label: "Territory diversity", score: Math.round(diversityScore), note: `${distinctIntents}/${payload.concepts.length || 0} distinct emotional territories` },
        { label: "Completeness", score: Math.round(completenessScore), note: `${complete}/${payload.concepts.length || 0} concepts have a hook and story` },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as CreativeConceptsPayload
    const distinctIntents = new Set(payload.concepts.map((c) => c.emotionalIntent)).size
    const avgBrandFit = payload.concepts.length ? Math.round(payload.concepts.reduce((s, c) => s + c.brandFitScore, 0) / payload.concepts.length) : 0
    return [
      { key: "creative_concepts_generated", kind: "business", value: payload.concepts.length },
      { key: "distinct_territories", kind: "operational", value: distinctIntents },
      { key: "creative_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
      { key: "avg_brand_fit", kind: "quality", value: avgBrandFit, unit: "%" },
    ]
  },
}

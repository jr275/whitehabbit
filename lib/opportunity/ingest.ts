import "server-only"

/* ================================================================== *
 * OPPORTUNITY INGESTION — turns skill_seo_opportunity's real, already-
 * evaluated output into persistent, scored, provenance-carrying
 * Opportunity + Entity rows. See docs/adr/ADR-006, ADR-014,
 * docs/architecture/vertical-slice.md.
 *
 * Called from lib/agent/runtime.ts right after a completed execution's
 * output is durably persisted — non-fatally: a failure here must never
 * fail the underlying agent execution it's derived from (mirrors the
 * existing appendWorkerMemory() call in the same file). Deliberately
 * decoupled from skill_seo_opportunity's internal TypeScript types
 * (SkillExecutionResult.structured is `unknown` by design) — this
 * validates the real shape it needs at runtime rather than trusting a
 * cross-module type import, so a future change to that skill's output
 * shape fails loudly here instead of silently miscounting.
 * ================================================================== */

import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { upsertEntityByName } from "@/lib/knowledge/repo"
import { computeFinalScore } from "./scoring"
import { createOpportunity } from "./repo"
import type { OpportunityScoreComponents } from "./model"

interface RawOpportunity {
  topic: string
  target_intent?: string
  suggested_title: string
  outline: string[]
  confidence: number
  source_indices: number[]
}

interface RawPlan {
  query: string
  opportunities: RawOpportunity[]
}

function isRawOpportunity(value: unknown): value is RawOpportunity {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.topic === "string" && typeof v.suggested_title === "string" && Array.isArray(v.outline) && typeof v.confidence === "number"
}

function isRawPlan(value: unknown): value is RawPlan {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.query === "string" && Array.isArray(v.opportunities) && v.opportunities.every(isRawOpportunity)
}

export interface IngestSeoOpportunityPlanInput {
  orgId: string
  executionId: string
  outputId: string
  structured: unknown
  /** the skill's own run-level evaluation breakdown — reused as the
   * real source of sourceGroundingScore/outlineCompletenessScore
   * rather than recomputing it, per ADR-006. */
  evaluation: { qualityScore: number; breakdown: { label: string; score: number }[] }
}

function scoreFromBreakdown(evaluation: IngestSeoOpportunityPlanInput["evaluation"], label: string): number | null {
  const entry = evaluation.breakdown.find((b) => b.label === label)
  return entry ? entry.score : null
}

/** Real, non-fatal ingestion. Returns the number of opportunities
 * persisted (0 if the output wasn't a recognizable SEO opportunity
 * plan, or had zero opportunities) — callers should log but never
 * throw on a non-zero-but-unexpected shape; this function itself never
 * throws for a shape mismatch, only for a real database failure, which
 * the caller (lib/agent/runtime.ts) already wraps in try/catch. */
export async function ingestSeoOpportunityPlan(input: IngestSeoOpportunityPlanInput): Promise<number> {
  if (!isRawPlan(input.structured)) return 0
  if (input.structured.opportunities.length === 0) return 0

  const project = await getOrCreateDefaultProject(input.orgId)
  const sourceGroundingScore = scoreFromBreakdown(input.evaluation, "Source grounding")
  const outlineCompletenessScore = scoreFromBreakdown(input.evaluation, "Outline completeness")

  let persisted = 0
  for (const raw of input.structured.opportunities) {
    const entity = await upsertEntityByName(input.orgId, project.id, "Topic", raw.topic, {
      discoveredVia: "skill_seo_opportunity",
    })

    const scores: OpportunityScoreComponents = {
      sourceGroundingScore,
      outlineCompletenessScore,
      confidenceScore: typeof raw.confidence === "number" ? raw.confidence : null,
      entityCoverageScore: null,
      demandScore: null,
      trendScore: null,
      businessValueScore: null,
      competitionScore: null,
      authorityGapScore: null,
      informationGainScore: null,
      citationPotentialScore: null,
      cannibalizationRiskScore: null,
    }
    const { finalScore, notes } = computeFinalScore(scores)

    await createOpportunity({
      orgId: input.orgId,
      projectId: project.id,
      sourceExecutionId: input.executionId,
      sourceOutputId: input.outputId,
      primaryEntityId: entity.id,
      title: raw.suggested_title,
      topic: raw.topic,
      targetIntent: raw.target_intent ?? null,
      outline: raw.outline,
      scores,
      finalScore,
      scoreNotes: notes,
    })
    persisted += 1
  }
  return persisted
}

import "server-only"

/* ================================================================== *
 * OPPORTUNITY ENGINE — repository. Org- and project-scoped throughout,
 * matching lib/db/repo.ts's convention. See docs/adr/ADR-006,
 * ADR-014, ADR-016 for the status-transition/audit model and the two
 * real provenance paths (a Worker Skill execution, or a website-
 * discovery agent_run).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { Opportunity, OpportunityScoreComponents, OpportunityStatus, OpportunityType } from "./model"

interface OpportunitySqlRow {
  id: string
  org_id: string
  project_id: string
  source_execution_id: string | null
  source_output_id: string | null
  source_agent_run_id: string | null
  website_id: string | null
  opportunity_type: OpportunityType | null
  primary_entity_id: string | null
  title: string
  topic: string
  target_intent: string | null
  outline: string[]
  status: OpportunityStatus
  source_grounding_score: number | null
  outline_completeness_score: number | null
  confidence_score: number | null
  entity_coverage_score: number | null
  demand_score: number | null
  trend_score: number | null
  business_value_score: number | null
  competition_score: number | null
  authority_gap_score: number | null
  information_gain_score: number | null
  citation_potential_score: number | null
  cannibalization_risk_score: number | null
  final_score: number | null
  score_notes: string | null
  information_gain_reasons: string[] | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

function rowToOpportunity(r: OpportunitySqlRow): Opportunity {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    sourceExecutionId: r.source_execution_id,
    sourceOutputId: r.source_output_id,
    sourceAgentRunId: r.source_agent_run_id,
    websiteId: r.website_id,
    opportunityType: r.opportunity_type,
    primaryEntityId: r.primary_entity_id,
    title: r.title,
    topic: r.topic,
    targetIntent: r.target_intent,
    outline: r.outline ?? [],
    status: r.status,
    sourceGroundingScore: r.source_grounding_score,
    outlineCompletenessScore: r.outline_completeness_score,
    confidenceScore: r.confidence_score,
    entityCoverageScore: r.entity_coverage_score,
    demandScore: r.demand_score,
    trendScore: r.trend_score,
    businessValueScore: r.business_value_score,
    competitionScore: r.competition_score,
    authorityGapScore: r.authority_gap_score,
    informationGainScore: r.information_gain_score,
    citationPotentialScore: r.citation_potential_score,
    cannibalizationRiskScore: r.cannibalization_risk_score,
    finalScore: r.final_score,
    scoreNotes: r.score_notes,
    informationGainReasons: r.information_gain_reasons,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at ? Number(r.reviewed_at) : null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export interface CreateOpportunityInput {
  orgId: string
  projectId: string
  /** exactly one provenance path must be set: the Worker Skill path
   * (sourceExecutionId + sourceOutputId) or the discovery-pipeline path
   * (sourceAgentRunId + websiteId) — matches the DB CHECK constraint. */
  sourceExecutionId?: string | null
  sourceOutputId?: string | null
  sourceAgentRunId?: string | null
  websiteId?: string | null
  opportunityType?: OpportunityType | null
  primaryEntityId?: string | null
  title: string
  topic: string
  targetIntent?: string | null
  outline: string[]
  scores: OpportunityScoreComponents
  finalScore: number | null
  scoreNotes: string | null
  informationGainReasons?: string[] | null
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
  const id = `opp_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO opportunities (
       id, org_id, project_id, source_execution_id, source_output_id, source_agent_run_id, website_id, opportunity_type, primary_entity_id,
       title, topic, target_intent, outline, status,
       source_grounding_score, outline_completeness_score, confidence_score, entity_coverage_score,
       demand_score, trend_score, business_value_score, competition_score,
       authority_gap_score, information_gain_score, citation_potential_score, cannibalization_risk_score,
       final_score, score_notes, information_gain_reasons, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, 'discovered',
       $14, $15, $16, $17,
       $18, $19, $20, $21,
       $22, $23, $24, $25,
       $26, $27, $28, $29, $29
     )`,
    [
      id,
      input.orgId,
      input.projectId,
      input.sourceExecutionId ?? null,
      input.sourceOutputId ?? null,
      input.sourceAgentRunId ?? null,
      input.websiteId ?? null,
      input.opportunityType ?? null,
      input.primaryEntityId ?? null,
      input.title,
      input.topic,
      input.targetIntent ?? null,
      JSON.stringify(input.outline),
      input.scores.sourceGroundingScore,
      input.scores.outlineCompletenessScore,
      input.scores.confidenceScore,
      input.scores.entityCoverageScore,
      input.scores.demandScore,
      input.scores.trendScore,
      input.scores.businessValueScore,
      input.scores.competitionScore,
      input.scores.authorityGapScore,
      input.scores.informationGainScore,
      input.scores.citationPotentialScore,
      input.scores.cannibalizationRiskScore,
      input.finalScore,
      input.scoreNotes,
      input.informationGainReasons ? JSON.stringify(input.informationGainReasons) : null,
      now,
    ],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    sourceExecutionId: input.sourceExecutionId ?? null,
    sourceOutputId: input.sourceOutputId ?? null,
    sourceAgentRunId: input.sourceAgentRunId ?? null,
    websiteId: input.websiteId ?? null,
    opportunityType: input.opportunityType ?? null,
    primaryEntityId: input.primaryEntityId ?? null,
    title: input.title,
    topic: input.topic,
    targetIntent: input.targetIntent ?? null,
    outline: input.outline,
    status: "discovered",
    ...input.scores,
    finalScore: input.finalScore,
    scoreNotes: input.scoreNotes,
    informationGainReasons: input.informationGainReasons ?? null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function listOpportunities(orgId: string, projectId: string, opts: { status?: OpportunityStatus; limit?: number } = {}): Promise<Opportunity[]> {
  const limit = Math.min(opts.limit ?? 100, 500)
  if (opts.status) {
    const rows = await query<OpportunitySqlRow>(
      "SELECT * FROM opportunities WHERE org_id = $1 AND project_id = $2 AND status = $3 ORDER BY final_score DESC NULLS LAST, created_at DESC LIMIT $4",
      [orgId, projectId, opts.status, limit],
    )
    return rows.map(rowToOpportunity)
  }
  const rows = await query<OpportunitySqlRow>(
    "SELECT * FROM opportunities WHERE org_id = $1 AND project_id = $2 ORDER BY final_score DESC NULLS LAST, created_at DESC LIMIT $3",
    [orgId, projectId, limit],
  )
  return rows.map(rowToOpportunity)
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the opportunity doesn't belong to orgId. */
export async function getOpportunity(id: string, orgId: string): Promise<Opportunity | null> {
  const row = await queryOne<OpportunitySqlRow>("SELECT * FROM opportunities WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToOpportunity(row) : null
}

/** Idempotency guard (§36): a re-run of discovery must never create a
 * second opportunity of the same type for the same entity. */
export async function getOpportunityForEntityAndType(orgId: string, projectId: string, entityId: string, type: OpportunityType): Promise<Opportunity | null> {
  const row = await queryOne<OpportunitySqlRow>(
    "SELECT * FROM opportunities WHERE org_id = $1 AND project_id = $2 AND primary_entity_id = $3 AND opportunity_type = $4",
    [orgId, projectId, entityId, type],
  )
  return row ? rowToOpportunity(row) : null
}

const REVIEW_TRANSITIONS: Record<string, OpportunityStatus[]> = {
  approved: ["discovered", "qualified"],
  rejected: ["discovered", "qualified"],
}

/** Approve/reject — the only status transitions exposed today (ADR-014:
 * a full lifecycle needs a QA/generation/publish pipeline that doesn't
 * exist yet). Returns null if the opportunity doesn't exist for this
 * org, or if it isn't in a state this transition is valid from — the
 * caller (API route) is responsible for turning that into the right
 * HTTP response; this function never silently no-ops a bad transition
 * into an apparent success. */
export async function reviewOpportunity(
  id: string,
  orgId: string,
  decision: "approved" | "rejected",
  reviewedBy: string,
): Promise<Opportunity | null> {
  const current = await getOpportunity(id, orgId)
  if (!current) return null
  const allowedFrom = REVIEW_TRANSITIONS[decision]
  if (!allowedFrom.includes(current.status)) return null

  const now = Date.now()
  await query("UPDATE opportunities SET status = $1, reviewed_by = $2, reviewed_at = $3, updated_at = $3 WHERE id = $4 AND org_id = $5", [
    decision,
    reviewedBy,
    now,
    id,
    orgId,
  ])
  return { ...current, status: decision, reviewedBy, reviewedAt: now, updatedAt: now }
}

export async function updateOpportunityStatus(id: string, orgId: string, status: OpportunityStatus): Promise<void> {
  await query("UPDATE opportunities SET status = $1, updated_at = $2 WHERE id = $3 AND org_id = $4", [status, Date.now(), id, orgId])
}

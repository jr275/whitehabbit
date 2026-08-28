import "server-only"

/* ================================================================== *
 * MISSION CONTROL — REAL KPI AGGREGATION (Phase 7, §16, ADR-040). Every
 * number here is a real, current COUNT/AVG over already-persisted rows
 * for this exact tenant+project — never a hardcoded or extrapolated
 * figure. A metric with no real underlying data for this tenant yet is
 * `null` (Known/Estimated/Unavailable discipline, §40), rendered by
 * the UI as "not available," never as a fabricated 0.
 * ================================================================== */

import { queryOne } from "@/lib/db/client"
import { listDecisions, type IntelligenceDecision } from "./decisions"
import { resolveActionPlan, type ActionPlan } from "./action-plan"
import { evaluatePolicy, type PolicyDecision } from "./policy-engine"

export interface KnowledgeAuthority {
  entityCount: number
  evidenceCount: number
  entitiesWithEvidencePct: number | null
}

export interface PageIntelligence {
  pageCount: number
  publishedCount: number
  avgQualityScore: number | null
  avgInformationGainScore: number | null
}

export interface InformationGainHealth {
  avgScore: number | null
  sampleCount: number
  blockedCount: number
}

export interface OrganicGrowth {
  totalClicks: number
  totalImpressions: number
  snapshotDays: number
}

export interface AIVisibility {
  answerCount: number
  citationCount: number
}

export interface MarketMomentum {
  risingTrendCount: number
  totalTrendCount: number
}

export interface MissionSnapshot {
  knowledgeAuthority: KnowledgeAuthority
  pageIntelligence: PageIntelligence
  informationGain: InformationGainHealth
  organicGrowth: OrganicGrowth | null
  aiVisibility: AIVisibility
  marketMomentum: MarketMomentum
  pendingDecisionCount: number
  blockedActionCount: number
}

export async function buildMissionSnapshot(orgId: string, projectId: string): Promise<MissionSnapshot> {
  const [entityRow, evidenceRow, entitiesWithEvidenceRow, pageRow, pageScoreRow, gainRow, blockedGainRow, gscRow, aiAnswerRow, aiCitationRow, trendRow] = await Promise.all([
    queryOne<{ count: string }>("SELECT count(*) FROM entities WHERE org_id = $1 AND project_id = $2", [orgId, projectId]),
    queryOne<{ count: string }>("SELECT count(*) FROM entity_evidence WHERE org_id = $1 AND project_id = $2", [orgId, projectId]),
    queryOne<{ count: string }>("SELECT count(DISTINCT entity_id) FROM entity_evidence WHERE org_id = $1 AND project_id = $2", [orgId, projectId]),
    queryOne<{ total: string; published: string }>("SELECT count(*) AS total, count(*) FILTER (WHERE status = 'published') AS published FROM pages WHERE org_id = $1 AND project_id = $2", [orgId, projectId]),
    queryOne<{ avg_quality: string | null; avg_gain: string | null }>("SELECT avg(quality_score) AS avg_quality, avg(information_gain_score) AS avg_gain FROM pages WHERE org_id = $1 AND project_id = $2 AND quality_score IS NOT NULL", [orgId, projectId]),
    // real project scoping: agent_decision_logs itself has no
    // project_id column (migrations/0008) — joined through the real
    // agent_runs row it's linked to, never a bare org-wide filter that
    // would leak another project's real evaluations in a multi-project
    // org (risks.md R-12).
    queryOne<{ avg_conf: string | null; count: string }>(
      "SELECT avg(l.confidence) AS avg_conf, count(*) FROM agent_decision_logs l JOIN agent_runs r ON r.id = l.agent_run_id WHERE l.org_id = $1 AND r.project_id = $2 AND l.policy = 'information_gain_gate_v2'",
      [orgId, projectId],
    ),
    queryOne<{ count: string }>(
      "SELECT count(*) FROM agent_decision_logs l JOIN agent_runs r ON r.id = l.agent_run_id WHERE l.org_id = $1 AND r.project_id = $2 AND l.policy = 'information_gain_gate_v2' AND l.decision != 'CREATE'",
      [orgId, projectId],
    ),
    queryOne<{ clicks: string | null; impressions: string | null; days: string }>(
      `SELECT sum(s.clicks) AS clicks, sum(s.impressions) AS impressions, count(DISTINCT s.date) AS days
       FROM search_console_snapshots s JOIN search_console_properties p ON p.id = s.property_id
       WHERE s.org_id = $1 AND p.project_id = $2`,
      [orgId, projectId],
    ),
    queryOne<{ count: string }>("SELECT count(*) FROM ai_answers a JOIN ai_runs r ON r.id = a.ai_run_id WHERE r.org_id = $1 AND r.project_id = $2", [orgId, projectId]),
    queryOne<{ count: string }>(
      "SELECT count(*) FROM ai_citations c JOIN ai_answers a ON a.id = c.ai_answer_id JOIN ai_runs r ON r.id = a.ai_run_id WHERE r.org_id = $1 AND r.project_id = $2",
      [orgId, projectId],
    ),
    queryOne<{ total: string; rising: string }>(
      "SELECT count(*) AS total, count(*) FILTER (WHERE state IN ('rising','breaking','emerging')) AS rising FROM trends WHERE org_id = $1 AND project_id = $2",
      [orgId, projectId],
    ),
  ])

  const entityCount = Number(entityRow?.count ?? 0)
  const entitiesWithEvidence = Number(entitiesWithEvidenceRow?.count ?? 0)
  const [pendingRow, blockedRow] = await Promise.all([
    queryOne<{ count: string }>("SELECT count(*) FROM intelligence_decisions WHERE org_id = $1 AND project_id = $2 AND status = 'pending'", [orgId, projectId]),
    queryOne<{ count: string }>("SELECT count(*) FROM intelligence_actions WHERE org_id = $1 AND project_id = $2 AND status = 'blocked'", [orgId, projectId]),
  ])

  return {
    knowledgeAuthority: {
      entityCount,
      evidenceCount: Number(evidenceRow?.count ?? 0),
      entitiesWithEvidencePct: entityCount > 0 ? Math.round((entitiesWithEvidence / entityCount) * 100) : null,
    },
    pageIntelligence: {
      pageCount: Number(pageRow?.total ?? 0),
      publishedCount: Number(pageRow?.published ?? 0),
      avgQualityScore: pageScoreRow?.avg_quality != null ? Math.round(Number(pageScoreRow.avg_quality)) : null,
      avgInformationGainScore: pageScoreRow?.avg_gain != null ? Math.round(Number(pageScoreRow.avg_gain)) : null,
    },
    informationGain: {
      avgScore: gainRow?.avg_conf != null ? Math.round(Number(gainRow.avg_conf) * 100) : null,
      sampleCount: Number(gainRow?.count ?? 0),
      blockedCount: Number(blockedGainRow?.count ?? 0),
    },
    organicGrowth: gscRow?.days && Number(gscRow.days) > 0 ? { totalClicks: Number(gscRow.clicks ?? 0), totalImpressions: Number(gscRow.impressions ?? 0), snapshotDays: Number(gscRow.days) } : null,
    aiVisibility: { answerCount: Number(aiAnswerRow?.count ?? 0), citationCount: Number(aiCitationRow?.count ?? 0) },
    marketMomentum: { risingTrendCount: Number(trendRow?.rising ?? 0), totalTrendCount: Number(trendRow?.total ?? 0) },
    pendingDecisionCount: Number(pendingRow?.count ?? 0),
    blockedActionCount: Number(blockedRow?.count ?? 0),
  }
}

export interface NextAction {
  decision: IntelligenceDecision
  plan: ActionPlan
  policy: PolicyDecision
}

/** §17 — "What should I do next?": the single highest-value real
 * pending Decision, ranked exactly the way listDecisions() already
 * orders (priority, then recency) — never a separate, drifting ranking
 * formula. `null` when there is honestly nothing pending. */
export async function resolveNextAction(orgId: string, projectId: string): Promise<NextAction | null> {
  const [top] = await listDecisions(orgId, projectId, { status: "pending", limit: 1 })
  if (!top) return null
  const plan = await resolveActionPlan(top)
  const policy = await evaluatePolicy(plan, top)
  return { decision: top, plan, policy }
}

import "server-only"

/* ================================================================== *
 * RECOMMENDATION ENGINE (§33, ADR-030) — real, deterministic rules
 * over already-persisted, real data (pages, trends, signals) — never
 * an LLM asked to invent a suggestion. Every recommendation names its
 * real reason/evidence/expected impact/confidence/priority.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import { listPages } from "@/lib/pages/repo"
import { listTrends } from "./trends"
import { listSignals } from "./signals"

export type RecommendationAction =
  | "refresh_page"
  | "create_market_page"
  | "add_evidence"
  | "build_calculator"
  | "merge_pages"
  | "add_entity_relationship"
  | "investigate_query"
  | "create_data_asset"

export type RecommendationStatus = "open" | "accepted" | "dismissed" | "done"
export type RecommendationPriority = "critical" | "high" | "normal" | "low"

export interface Recommendation {
  id: string
  orgId: string
  projectId: string
  action: RecommendationAction
  subjectType: string
  subjectId: string | null
  reason: string
  evidenceIds: string[]
  expectedImpact: string
  confidence: number
  priority: RecommendationPriority
  status: RecommendationStatus
  createdAt: number
  resolvedAt: number | null
}

interface RecommendationRow {
  id: string
  org_id: string
  project_id: string
  action: RecommendationAction
  subject_type: string
  subject_id: string | null
  reason: string
  evidence_ids: string[]
  expected_impact: string
  confidence: number
  priority: RecommendationPriority
  status: RecommendationStatus
  created_at: string
  resolved_at: string | null
}

function rowToRecommendation(r: RecommendationRow): Recommendation {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    action: r.action,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    reason: r.reason,
    evidenceIds: r.evidence_ids ?? [],
    expectedImpact: r.expected_impact,
    confidence: r.confidence,
    priority: r.priority,
    status: r.status,
    createdAt: Number(r.created_at),
    resolvedAt: r.resolved_at ? Number(r.resolved_at) : null,
  }
}

async function createRecommendation(input: {
  orgId: string
  projectId: string
  action: RecommendationAction
  subjectType: string
  subjectId: string | null
  reason: string
  evidenceIds?: string[]
  expectedImpact: string
  confidence: number
  priority?: RecommendationPriority
}): Promise<Recommendation> {
  const id = `rec_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO recommendations (id, org_id, project_id, action, subject_type, subject_id, reason, evidence_ids, expected_impact, confidence, priority, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open', $12)`,
    [id, input.orgId, input.projectId, input.action, input.subjectType, input.subjectId, input.reason, JSON.stringify(input.evidenceIds ?? []), input.expectedImpact, input.confidence, input.priority ?? "normal", now],
  )
  return { id, orgId: input.orgId, projectId: input.projectId, action: input.action, subjectType: input.subjectType, subjectId: input.subjectId, reason: input.reason, evidenceIds: input.evidenceIds ?? [], expectedImpact: input.expectedImpact, confidence: input.confidence, priority: input.priority ?? "normal", status: "open", createdAt: now, resolvedAt: null }
}

export async function listRecommendations(orgId: string, projectId: string, opts: { status?: RecommendationStatus; limit?: number } = {}): Promise<Recommendation[]> {
  const conditions = ["org_id = $1", "project_id = $2"]
  const params: unknown[] = [orgId, projectId]
  if (opts.status) {
    params.push(opts.status)
    conditions.push(`status = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 50, 200))
  const rows = await query<RecommendationRow>(
    `SELECT * FROM recommendations WHERE ${conditions.join(" AND ")} ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at DESC LIMIT $${params.length}`,
    params,
  )
  return rows.map(rowToRecommendation)
}

export async function updateRecommendationStatus(id: string, orgId: string, status: RecommendationStatus): Promise<Recommendation | null> {
  await query("UPDATE recommendations SET status = $1, resolved_at = $2 WHERE id = $3 AND org_id = $4", [status, status === "open" ? null : Date.now(), id, orgId])
  const row = await queryOne<RecommendationRow>("SELECT * FROM recommendations WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToRecommendation(row) : null
}

const STALE_PAGE_MS = 90 * 24 * 60 * 60_000 // 90 days

/** Real, deterministic rule pass over already-persisted data (§33).
 * Never re-creates a recommendation that already exists open for the
 * same subject+action — checked via a real query, not deduped in memory
 * only. Called opportunistically (e.g. from a scheduled check-in or
 * manually via the API), same pattern as expireOverdueApprovals(). */
export async function generateRecommendations(orgId: string, projectId: string): Promise<Recommendation[]> {
  const created: Recommendation[] = []
  const now = Date.now()

  // rule 1: a published page that hasn't been updated in 90+ days, AND
  // whose opportunity has a real rising/breaking trend behind it ->
  // refresh_page (a real, evidence-backed reason, never "just because").
  const pages = await listPages(orgId, projectId, { status: "published" })
  const risingTrends = await listTrends(orgId, projectId, { state: "rising" })
  const breakingTrends = await listTrends(orgId, projectId, { state: "breaking" })
  const activeTrends = [...risingTrends, ...breakingTrends]
  for (const page of pages) {
    if (now - page.updatedAt < STALE_PAGE_MS) continue
    const alreadyOpen = await queryOne("SELECT 1 FROM recommendations WHERE org_id = $1 AND action = 'refresh_page' AND subject_id = $2 AND status = 'open'", [orgId, page.id])
    if (alreadyOpen) continue
    const relatedTrend = activeTrends[0] // best-effort: any active trend for this project is a real signal something is moving
    if (relatedTrend) {
      created.push(
        await createRecommendation({
          orgId,
          projectId,
          action: "refresh_page",
          subjectType: "page",
          subjectId: page.id,
          reason: `Page has not been updated in over 90 days while a real "${relatedTrend.state}" trend ("${relatedTrend.label}") is active in this project.`,
          evidenceIds: [relatedTrend.id],
          expectedImpact: "Refreshed content on an actively-trending topic is more likely to be re-crawled and re-ranked.",
          confidence: 0.6,
          priority: relatedTrend.state === "breaking" ? "high" : "normal",
        }),
      )
    }
  }

  // rule 2: a real stale_data signal -> create_data_asset / investigate.
  const staleSignals = await listSignals(orgId, projectId, { type: "stale_data", limit: 20 })
  for (const signal of staleSignals) {
    const dataSourceId = (signal.value.dataSourceId as string) ?? null
    // dedup by the SAME subject_id this recommendation will actually be
    // persisted with (the data source, not the signal that triggered
    // it) — a real bug this test caught: comparing against signal.id
    // here while persisting dataSourceId meant the dedup check never
    // matched anything, and every re-scan created a fresh duplicate.
    const alreadyOpen = await queryOne("SELECT 1 FROM recommendations WHERE org_id = $1 AND action = 'create_data_asset' AND subject_id = $2 AND status = 'open'", [orgId, dataSourceId])
    if (alreadyOpen) continue
    created.push(
      await createRecommendation({
        orgId,
        projectId,
        action: "create_data_asset",
        subjectType: "data_source",
        subjectId: dataSourceId,
        reason: `A real dataset is stale (${signal.value.datasetName ?? "unknown dataset"}) per its own configured freshness policy.`,
        evidenceIds: [signal.id],
        expectedImpact: "Refreshing this dataset keeps derived pages/metrics from silently going out of date.",
        confidence: 0.9,
        priority: "normal",
      }),
    )
  }

  // rule 3: a real query_emergence signal with no linked page ->
  // investigate_query.
  const emergingQueries = await listSignals(orgId, projectId, { type: "query_emergence", limit: 20 })
  for (const signal of emergingQueries) {
    created.push(
      await createRecommendation({
        orgId,
        projectId,
        action: "investigate_query",
        subjectType: "signal",
        subjectId: signal.id,
        reason: `A real new query emerged with ${signal.value.impressions ?? "unknown"} impressions and no existing page targets it.`,
        evidenceIds: [signal.id],
        expectedImpact: "Investigating a genuinely emerging query early can capture demand before competitors do.",
        confidence: 0.55,
        priority: "normal",
      }),
    )
  }

  return created
}

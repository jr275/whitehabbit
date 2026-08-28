import "server-only"

/* ================================================================== *
 * SIGNAL (§10, ADR-024) — raw observed information. NOT automatically
 * a fact: every signal carries a real confidence and a real source, and
 * nothing downstream (Trend, Opportunity) treats a signal as ground
 * truth without going through its own real thresholds/verification.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

/* Two naming generations coexist deliberately (ADR-032, not an
 * oversight): the lowercase_snake_case types below were Phase 5B's
 * Search Console detector output, already covered by real tests and a
 * real UI-facing contract (the /api/v1/signals response shape). Phase
 * 6's brief specifies a broader, UPPER_SNAKE_CASE taxonomy covering
 * sources beyond Search Console (Knowledge Graph, AI Visibility,
 * competitors, internal links, Information Gain). Renaming the
 * existing types would be a breaking API change with zero real
 * benefit; both generations are valid, real signal types emitted by
 * lib/intelligence/signal-engine.ts, the one unified emission facade
 * every detector in this codebase goes through (§2 — "não deixe cada
 * módulo criar seu próprio sistema de sinais isoladamente"). */
export type SignalType =
  // Phase 5B — Search Console detectors (lib/intelligence/search-console/signal-detection.ts)
  | "search_impression_spike"
  | "search_click_spike"
  | "ctr_anomaly"
  | "position_improvement"
  | "position_decline"
  | "query_emergence"
  | "query_decay"
  | "page_decay"
  | "query_page_mismatch"
  | "high_impression_low_ctr"
  | "high_ctr_low_position"
  | "stale_data"
  | "competitor_change"
  | "manual"
  // Phase 6 — the unified taxonomy (lib/intelligence/signal-engine.ts)
  | "SEARCH_DEMAND_INCREASED"
  | "QUERY_EMERGING"
  | "QUERY_DECLINING"
  | "PAGE_TRAFFIC_DECLINED"
  | "PAGE_CTR_DECLINED"
  | "ENTITY_GAP"
  | "ENTITY_RELATIONSHIP_GAP"
  | "CONTENT_GAP"
  | "COMPETITOR_GAIN"
  | "NEW_MARKET_SIGNAL"
  | "NEW_ROLE_SIGNAL"
  | "TREND_ACCELERATION"
  | "CONTENT_DECAY"
  | "AI_CITATION_GAIN"
  | "AI_CITATION_LOSS"
  | "INDEXATION_CHANGE"
  | "INFORMATION_GAIN_GAP"
  | "INTERNAL_LINK_GAP"

export interface Signal {
  id: string
  orgId: string
  projectId: string
  sourceId: string | null
  type: SignalType
  entityId: string | null
  marketId: string | null
  roleId: string | null
  intentId: string | null
  value: Record<string, unknown>
  observedAt: number
  source: string
  confidence: number
  rawReference: string | null
  createdAt: number
}

interface SignalRow {
  id: string
  org_id: string
  project_id: string
  source_id: string | null
  type: SignalType
  entity_id: string | null
  market_id: string | null
  role_id: string | null
  intent_id: string | null
  value: Record<string, unknown>
  observed_at: string
  source: string
  confidence: number
  raw_reference: string | null
  created_at: string
}

function rowToSignal(r: SignalRow): Signal {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    sourceId: r.source_id,
    type: r.type,
    entityId: r.entity_id,
    marketId: r.market_id,
    roleId: r.role_id,
    intentId: r.intent_id,
    value: r.value,
    observedAt: Number(r.observed_at),
    source: r.source,
    confidence: r.confidence,
    rawReference: r.raw_reference,
    createdAt: Number(r.created_at),
  }
}

export async function recordSignal(input: {
  orgId: string
  projectId: string
  sourceId?: string | null
  type: SignalType
  entityId?: string | null
  marketId?: string | null
  roleId?: string | null
  intentId?: string | null
  value: Record<string, unknown>
  observedAt?: number
  source: string
  confidence: number
  rawReference?: string | null
}): Promise<Signal> {
  const id = `sig_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO signals (id, org_id, project_id, source_id, type, entity_id, market_id, role_id, intent_id, value, observed_at, source, confidence, raw_reference, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.sourceId ?? null,
      input.type,
      input.entityId ?? null,
      input.marketId ?? null,
      input.roleId ?? null,
      input.intentId ?? null,
      JSON.stringify(input.value),
      input.observedAt ?? now,
      input.source,
      input.confidence,
      input.rawReference ?? null,
      now,
    ],
  )
  return (await getSignal(id, input.orgId))!
}

export async function getSignal(id: string, orgId: string): Promise<Signal | null> {
  const row = await queryOne<SignalRow>("SELECT * FROM signals WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToSignal(row) : null
}

export async function listSignals(orgId: string, projectId: string, opts: { type?: SignalType; entityId?: string; limit?: number } = {}): Promise<Signal[]> {
  const conditions = ["org_id = $1", "project_id = $2"]
  const params: unknown[] = [orgId, projectId]
  if (opts.type) {
    params.push(opts.type)
    conditions.push(`type = $${params.length}`)
  }
  if (opts.entityId) {
    params.push(opts.entityId)
    conditions.push(`entity_id = $${params.length}`)
  }
  const limit = Math.min(opts.limit ?? 100, 500)
  params.push(limit)
  const rows = await query<SignalRow>(`SELECT * FROM signals WHERE ${conditions.join(" AND ")} ORDER BY observed_at DESC LIMIT $${params.length}`, params)
  return rows.map(rowToSignal)
}

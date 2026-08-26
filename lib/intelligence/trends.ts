import "server-only"

/* ================================================================== *
 * TREND — repository (§15). See lib/intelligence/trend-engine.ts for
 * the pure detection math; this module is persistence only.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export type TrendState = "emerging" | "rising" | "stable" | "declining" | "breaking"

export interface Trend {
  id: string
  orgId: string
  projectId: string
  label: string
  entityId: string | null
  state: TrendState
  velocity: number
  acceleration: number | null
  momentum: number
  seasonality: string | null
  confidence: number
  signalIds: string[]
  detectedAt: number
  updatedAt: number
}

interface TrendRow {
  id: string
  org_id: string
  project_id: string
  label: string
  entity_id: string | null
  state: TrendState
  velocity: number
  acceleration: number | null
  momentum: number
  seasonality: string | null
  confidence: number
  signal_ids: string[]
  detected_at: string
  updated_at: string
}

function rowToTrend(r: TrendRow): Trend {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    label: r.label,
    entityId: r.entity_id,
    state: r.state,
    velocity: r.velocity,
    acceleration: r.acceleration,
    momentum: r.momentum,
    seasonality: r.seasonality,
    confidence: r.confidence,
    signalIds: r.signal_ids ?? [],
    detectedAt: Number(r.detected_at),
    updatedAt: Number(r.updated_at),
  }
}

export async function upsertTrend(input: {
  orgId: string
  projectId: string
  label: string
  entityId?: string | null
  state: TrendState
  velocity: number
  acceleration: number | null
  momentum: number
  seasonality: string | null
  confidence: number
  signalIds: string[]
}): Promise<Trend> {
  const existing = await queryOne<TrendRow>("SELECT * FROM trends WHERE org_id = $1 AND project_id = $2 AND label = $3", [input.orgId, input.projectId, input.label])
  const now = Date.now()
  if (existing) {
    await query(
      `UPDATE trends SET state = $1, velocity = $2, acceleration = $3, momentum = $4, seasonality = $5, confidence = $6, signal_ids = $7, updated_at = $8 WHERE id = $9`,
      [input.state, input.velocity, input.acceleration, input.momentum, input.seasonality, input.confidence, JSON.stringify(input.signalIds), now, existing.id],
    )
    return (await getTrend(existing.id, input.orgId))!
  }
  const id = `trend_${randomUUID()}`
  await query(
    `INSERT INTO trends (id, org_id, project_id, label, entity_id, state, velocity, acceleration, momentum, seasonality, confidence, signal_ids, detected_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.label,
      input.entityId ?? null,
      input.state,
      input.velocity,
      input.acceleration,
      input.momentum,
      input.seasonality,
      input.confidence,
      JSON.stringify(input.signalIds),
      now,
    ],
  )
  return (await getTrend(id, input.orgId))!
}

export async function getTrend(id: string, orgId: string): Promise<Trend | null> {
  const row = await queryOne<TrendRow>("SELECT * FROM trends WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToTrend(row) : null
}

export async function listTrends(orgId: string, projectId: string, opts: { state?: TrendState; limit?: number } = {}): Promise<Trend[]> {
  const conditions = ["org_id = $1", "project_id = $2"]
  const params: unknown[] = [orgId, projectId]
  if (opts.state) {
    params.push(opts.state)
    conditions.push(`state = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 50, 200))
  const rows = await query<TrendRow>(`SELECT * FROM trends WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT $${params.length}`, params)
  return rows.map(rowToTrend)
}

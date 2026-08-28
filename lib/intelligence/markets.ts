import "server-only"

/* ================================================================== *
 * MARKET INTELLIGENCE (§19) — generic Market + MetricDefinition +
 * MetricObservation. No hard-coded vertical assumptions: a metric
 * declares its own definition/unit/source/methodology, so "rental
 * yield in Rio de Janeiro" and "trial-to-paid conversion in the US
 * mid-market segment" are the exact same shape.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import { recordSignal } from "./signals"

export interface Market {
  id: string
  orgId: string
  projectId: string
  name: string
  geography: string | null
  createdAt: number
}

interface MarketRow {
  id: string
  org_id: string
  project_id: string
  name: string
  geography: string | null
  created_at: string
}

function rowToMarket(r: MarketRow): Market {
  return { id: r.id, orgId: r.org_id, projectId: r.project_id, name: r.name, geography: r.geography, createdAt: Number(r.created_at) }
}

export async function getOrCreateMarket(orgId: string, projectId: string, name: string, geography?: string | null): Promise<Market> {
  const existing = await queryOne<MarketRow>("SELECT * FROM markets WHERE project_id = $1 AND lower(name) = lower($2)", [projectId, name])
  if (existing) return rowToMarket(existing)
  const id = `mkt_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO markets (id, org_id, project_id, name, geography, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [id, orgId, projectId, name, geography ?? null, now])
  // NEW_MARKET_SIGNAL (§2) — only on a genuinely new row, never on a
  // cache hit against an already-known market.
  await recordSignal({ orgId, projectId, type: "NEW_MARKET_SIGNAL", marketId: id, value: { name, geography: geography ?? null }, source: "signal_engine", confidence: 1 })
  return { id, orgId, projectId, name, geography: geography ?? null, createdAt: now }
}

export async function listMarkets(orgId: string, projectId: string): Promise<Market[]> {
  const rows = await query<MarketRow>("SELECT * FROM markets WHERE org_id = $1 AND project_id = $2 ORDER BY name ASC", [orgId, projectId])
  return rows.map(rowToMarket)
}

export interface MetricDefinition {
  id: string
  orgId: string
  projectId: string
  name: string
  unit: string
  methodology: string
  source: string
  createdAt: number
}

interface MetricDefinitionRow {
  id: string
  org_id: string
  project_id: string
  name: string
  unit: string
  methodology: string
  source: string
  created_at: string
}

function rowToMetricDefinition(r: MetricDefinitionRow): MetricDefinition {
  return { id: r.id, orgId: r.org_id, projectId: r.project_id, name: r.name, unit: r.unit, methodology: r.methodology, source: r.source, createdAt: Number(r.created_at) }
}

export async function getOrCreateMetricDefinition(input: { orgId: string; projectId: string; name: string; unit: string; methodology: string; source: string }): Promise<MetricDefinition> {
  const existing = await queryOne<MetricDefinitionRow>("SELECT * FROM metric_definitions WHERE project_id = $1 AND lower(name) = lower($2)", [input.projectId, input.name])
  if (existing) return rowToMetricDefinition(existing)
  const id = `metricdef_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO metric_definitions (id, org_id, project_id, name, unit, methodology, source, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
    id,
    input.orgId,
    input.projectId,
    input.name,
    input.unit,
    input.methodology,
    input.source,
    now,
  ])
  return { id, orgId: input.orgId, projectId: input.projectId, name: input.name, unit: input.unit, methodology: input.methodology, source: input.source, createdAt: now }
}

export interface MetricObservation {
  id: string
  orgId: string
  metricDefinitionId: string
  marketId: string
  period: string
  value: number
  observedAt: number
}

interface MetricObservationRow {
  id: string
  org_id: string
  metric_definition_id: string
  market_id: string
  period: string
  value: number
  observed_at: string
}

function rowToObservation(r: MetricObservationRow): MetricObservation {
  return { id: r.id, orgId: r.org_id, metricDefinitionId: r.metric_definition_id, marketId: r.market_id, period: r.period, value: r.value, observedAt: Number(r.observed_at) }
}

export async function recordMetricObservation(input: { orgId: string; metricDefinitionId: string; marketId: string; period: string; value: number; observedAt?: number }): Promise<MetricObservation> {
  const id = `metricobs_${randomUUID()}`
  const now = input.observedAt ?? Date.now()
  await query("INSERT INTO metric_observations (id, org_id, metric_definition_id, market_id, period, value, observed_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    id,
    input.orgId,
    input.metricDefinitionId,
    input.marketId,
    input.period,
    input.value,
    now,
  ])
  return { id, orgId: input.orgId, metricDefinitionId: input.metricDefinitionId, marketId: input.marketId, period: input.period, value: input.value, observedAt: now }
}

/** The real time series for one metric+market — what a MetricSeries
 * "view" is (§19): a query, not a separate stored table. */
export async function getMetricSeries(metricDefinitionId: string, marketId: string): Promise<MetricObservation[]> {
  const rows = await query<MetricObservationRow>("SELECT * FROM metric_observations WHERE metric_definition_id = $1 AND market_id = $2 ORDER BY period ASC", [
    metricDefinitionId,
    marketId,
  ])
  return rows.map(rowToObservation)
}

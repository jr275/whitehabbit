import "server-only"

/* ================================================================== *
 * QUERY (§17) — a real observed or candidate query, classified by
 * intent and connected to Entity/Market/Role/Page. See
 * lib/intelligence/intent-classifier.ts for the classification itself.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { IntentLabel } from "./intent-classifier"
import { classifyIntent } from "./intent-classifier"

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ")
}

export interface Query {
  id: string
  orgId: string
  projectId: string
  text: string
  normalizedText: string
  intent: IntentLabel | null
  intentConfidence: number | null
  entityId: string | null
  marketId: string | null
  roleId: string | null
  pageId: string | null
  source: string
  firstObservedAt: number
  lastObservedAt: number
  createdAt: number
}

interface QueryRow {
  id: string
  org_id: string
  project_id: string
  text: string
  normalized_text: string
  intent: IntentLabel | null
  intent_confidence: number | null
  entity_id: string | null
  market_id: string | null
  role_id: string | null
  page_id: string | null
  source: string
  first_observed_at: string
  last_observed_at: string
  created_at: string
}

function rowToQuery(r: QueryRow): Query {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    text: r.text,
    normalizedText: r.normalized_text,
    intent: r.intent,
    intentConfidence: r.intent_confidence,
    entityId: r.entity_id,
    marketId: r.market_id,
    roleId: r.role_id,
    pageId: r.page_id,
    source: r.source,
    firstObservedAt: Number(r.first_observed_at),
    lastObservedAt: Number(r.last_observed_at),
    createdAt: Number(r.created_at),
  }
}

/** Idempotent by (project, normalized text) — re-observing the same
 * real query (e.g. a fresh Search Console day) updates lastObservedAt
 * rather than creating a duplicate row. Classifies intent deterministically
 * on first observation only — never reclassified on every re-observation,
 * so a query's intent label stays stable for downstream consumers. */
export async function observeQuery(input: { orgId: string; projectId: string; text: string; entityId?: string | null; marketId?: string | null; source: string; observedAt?: number }): Promise<Query> {
  const normalizedText = normalize(input.text)
  const now = input.observedAt ?? Date.now()
  const existing = await queryOne<QueryRow>("SELECT * FROM queries WHERE project_id = $1 AND normalized_text = $2", [input.projectId, normalizedText])
  if (existing) {
    await query("UPDATE queries SET last_observed_at = $1 WHERE id = $2", [now, existing.id])
    return { ...rowToQuery(existing), lastObservedAt: now }
  }
  const classification = classifyIntent(input.text)
  const id = `query_${randomUUID()}`
  await query(
    `INSERT INTO queries (id, org_id, project_id, text, normalized_text, intent, intent_confidence, entity_id, market_id, source, first_observed_at, last_observed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)`,
    [id, input.orgId, input.projectId, input.text, normalizedText, classification.intent, classification.confidence, input.entityId ?? null, input.marketId ?? null, input.source, now],
  )
  return (await getQuery(id, input.orgId))!
}

export async function getQuery(id: string, orgId: string): Promise<Query | null> {
  const row = await queryOne<QueryRow>("SELECT * FROM queries WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToQuery(row) : null
}

export async function listQueries(orgId: string, projectId: string, opts: { intent?: IntentLabel; limit?: number } = {}): Promise<Query[]> {
  const conditions = ["org_id = $1", "project_id = $2"]
  const params: unknown[] = [orgId, projectId]
  if (opts.intent) {
    params.push(opts.intent)
    conditions.push(`intent = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 100, 500))
  const rows = await query<QueryRow>(`SELECT * FROM queries WHERE ${conditions.join(" AND ")} ORDER BY last_observed_at DESC LIMIT $${params.length}`, params)
  return rows.map(rowToQuery)
}

export async function linkQueryToPage(id: string, orgId: string, pageId: string): Promise<void> {
  await query("UPDATE queries SET page_id = $1 WHERE id = $2 AND org_id = $3", [pageId, id, orgId])
}

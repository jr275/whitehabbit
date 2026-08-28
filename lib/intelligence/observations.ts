import "server-only"

/* ================================================================== *
 * INTELLIGENCE OBSERVATION (§1, §3, ADR-032) — the real output of the
 * Correlation Engine (lib/intelligence/correlation-engine.ts): a named
 * pattern match over >=1 real Signal rows. Still not a fact — it's a
 * real, deterministic READING of several signals together, one stage
 * closer to an Insight than any single Signal is on its own.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export type ObservationStatus = "active" | "expired" | "superseded"

export interface IntelligenceObservation {
  id: string
  orgId: string
  projectId: string
  pattern: string
  summary: string
  signalIds: string[]
  confidence: number
  status: ObservationStatus
  source: string
  createdAt: number
  updatedAt: number
  expiresAt: number | null
}

interface ObservationRow {
  id: string
  org_id: string
  project_id: string
  pattern: string
  summary: string
  signal_ids: string[]
  confidence: number
  status: ObservationStatus
  source: string
  created_at: string
  updated_at: string
  expires_at: string | null
}

function rowToObservation(r: ObservationRow): IntelligenceObservation {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    pattern: r.pattern,
    summary: r.summary,
    signalIds: r.signal_ids ?? [],
    confidence: r.confidence,
    status: r.status,
    source: r.source,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
  }
}

export async function createObservation(input: {
  orgId: string
  projectId: string
  pattern: string
  summary: string
  signalIds: string[]
  confidence: number
  source?: string
  expiresAt?: number | null
}): Promise<IntelligenceObservation> {
  const id = `obs_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO intelligence_observations (id, org_id, project_id, pattern, summary, signal_ids, confidence, status, source, created_at, updated_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $9, $10)`,
    [id, input.orgId, input.projectId, input.pattern, input.summary, JSON.stringify(input.signalIds), input.confidence, input.source ?? "correlation_engine", now, input.expiresAt ?? null],
  )
  return (await getObservation(id, input.orgId))!
}

export async function getObservation(id: string, orgId: string): Promise<IntelligenceObservation | null> {
  const row = await queryOne<ObservationRow>("SELECT * FROM intelligence_observations WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToObservation(row) : null
}

export async function listObservations(orgId: string, projectId: string, opts: { pattern?: string; status?: ObservationStatus; limit?: number } = {}): Promise<IntelligenceObservation[]> {
  const conditions = ["org_id = $1", "project_id = $2"]
  const params: unknown[] = [orgId, projectId]
  if (opts.pattern) {
    params.push(opts.pattern)
    conditions.push(`pattern = $${params.length}`)
  }
  if (opts.status) {
    params.push(opts.status)
    conditions.push(`status = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 50, 200))
  const rows = await query<ObservationRow>(`SELECT * FROM intelligence_observations WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length}`, params)
  return rows.map(rowToObservation)
}

export async function supersedeObservation(id: string, orgId: string): Promise<void> {
  await query("UPDATE intelligence_observations SET status = 'superseded', updated_at = $1 WHERE id = $2 AND org_id = $3", [Date.now(), id, orgId])
}

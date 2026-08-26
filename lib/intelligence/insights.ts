import "server-only"

/* ================================================================== *
 * INSIGHT (§9) — a real, evidence-backed conclusion drawn from one or
 * more Signals. Distinct from a Signal (raw observation) and an
 * Opportunity (a proposed action) — a stage of knowledge in between.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export interface Insight {
  id: string
  orgId: string
  projectId: string
  title: string
  summary: string
  category: string
  confidence: number
  signalIds: string[]
  createdAt: number
}

interface InsightRow {
  id: string
  org_id: string
  project_id: string
  title: string
  summary: string
  category: string
  confidence: number
  signal_ids: string[]
  created_at: string
}

function rowToInsight(r: InsightRow): Insight {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    title: r.title,
    summary: r.summary,
    category: r.category,
    confidence: r.confidence,
    signalIds: r.signal_ids ?? [],
    createdAt: Number(r.created_at),
  }
}

export async function createInsight(input: { orgId: string; projectId: string; title: string; summary: string; category: string; confidence: number; signalIds: string[] }): Promise<Insight> {
  const id = `ins_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO insights (id, org_id, project_id, title, summary, category, confidence, signal_ids, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, input.orgId, input.projectId, input.title, input.summary, input.category, input.confidence, JSON.stringify(input.signalIds), now],
  )
  return (await getInsight(id, input.orgId))!
}

export async function getInsight(id: string, orgId: string): Promise<Insight | null> {
  const row = await queryOne<InsightRow>("SELECT * FROM insights WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToInsight(row) : null
}

export async function listInsights(orgId: string, projectId: string, limit = 50): Promise<Insight[]> {
  const rows = await query<InsightRow>("SELECT * FROM insights WHERE org_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT $3", [
    orgId,
    projectId,
    Math.min(limit, 200),
  ])
  return rows.map(rowToInsight)
}

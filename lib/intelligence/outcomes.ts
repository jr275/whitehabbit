import "server-only"

/* ================================================================== *
 * INTELLIGENCE OUTCOME (§13, ADR-033) — a real, measured result of an
 * Action. Never fabricated: a metric with no real baseline yet gets
 * `delta: null`, not a guessed number. Feeds Score Calibration
 * (lib/intelligence/score-calibration.ts, ADR-034).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"

export interface IntelligenceOutcome {
  id: string
  orgId: string
  projectId: string
  actionId: string
  metric: string
  baseline: number | null
  value: number
  delta: number | null
  confidence: number
  evidence: string[]
  measuredAt: number
  createdAt: number
}

interface OutcomeRow {
  id: string
  org_id: string
  project_id: string
  action_id: string
  metric: string
  baseline: number | null
  value: number
  delta: number | null
  confidence: number
  evidence: string[]
  measured_at: string
  created_at: string
}

function rowToOutcome(r: OutcomeRow): IntelligenceOutcome {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    actionId: r.action_id,
    metric: r.metric,
    baseline: r.baseline,
    value: r.value,
    delta: r.delta,
    confidence: r.confidence,
    evidence: r.evidence ?? [],
    measuredAt: Number(r.measured_at),
    createdAt: Number(r.created_at),
  }
}

export async function recordOutcome(input: {
  orgId: string
  projectId: string
  actionId: string
  metric: string
  baseline?: number | null
  value: number
  confidence: number
  evidence?: string[]
  measuredAt?: number
}): Promise<IntelligenceOutcome> {
  const id = `out_${randomUUID()}`
  const now = Date.now()
  const delta = input.baseline != null ? input.value - input.baseline : null
  await query(
    `INSERT INTO intelligence_outcomes (id, org_id, project_id, action_id, metric, baseline, value, delta, confidence, evidence, measured_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, input.orgId, input.projectId, input.actionId, input.metric, input.baseline ?? null, input.value, delta, input.confidence, JSON.stringify(input.evidence ?? []), input.measuredAt ?? now, now],
  )
  return { id, orgId: input.orgId, projectId: input.projectId, actionId: input.actionId, metric: input.metric, baseline: input.baseline ?? null, value: input.value, delta, confidence: input.confidence, evidence: input.evidence ?? [], measuredAt: input.measuredAt ?? now, createdAt: now }
}

export async function listOutcomesForAction(orgId: string, actionId: string): Promise<IntelligenceOutcome[]> {
  const rows = await query<OutcomeRow>("SELECT * FROM intelligence_outcomes WHERE org_id = $1 AND action_id = $2 ORDER BY measured_at ASC", [orgId, actionId])
  return rows.map(rowToOutcome)
}

export async function listOutcomes(orgId: string, projectId: string, limit = 100): Promise<IntelligenceOutcome[]> {
  const rows = await query<OutcomeRow>("SELECT * FROM intelligence_outcomes WHERE org_id = $1 AND project_id = $2 ORDER BY measured_at DESC LIMIT $3", [orgId, projectId, Math.min(limit, 500)])
  return rows.map(rowToOutcome)
}

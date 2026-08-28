import "server-only"

/* ================================================================== *
 * INTELLIGENCE DECISION (§4, ADR-032) — a real, explainable choice
 * among a closed action taxonomy. Every row states its own reason,
 * evidence, expected impact, cost, risk, and confidence — "AI decided
 * this" is never an acceptable justification anywhere in this codebase
 * (§13's autonomy discipline, unchanged). See
 * lib/intelligence/decision-engine.ts for the pure function that
 * produces these.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export type DecisionAction =
  | "CREATE_PAGE"
  | "UPDATE_PAGE"
  | "MERGE_PAGES"
  | "REDIRECT_PAGE"
  | "ADD_INTERNAL_LINKS"
  | "CREATE_HUB"
  | "CREATE_DATASET"
  | "CREATE_CALCULATOR"
  | "CREATE_COMPARISON"
  | "CREATE_FAQ"
  | "REFRESH_CONTENT"
  | "INVESTIGATE_ENTITY"
  | "EXPAND_MARKET"
  | "EXPAND_ROLE"
  | "MONITOR"
  | "DO_NOTHING"

export type DecisionRisk = "low" | "medium" | "high" | "critical"
export type DecisionStatus = "pending" | "approved" | "rejected" | "executed" | "expired" | "cancelled"
export type DecisionPriority = "critical" | "high" | "normal" | "low"

export interface EstimatedCost {
  tokens?: number
  usd?: number
  agentSteps?: number
}

export interface IntelligenceDecision {
  id: string
  orgId: string
  projectId: string
  action: DecisionAction
  subjectType: string
  subjectId: string | null
  reason: string
  evidenceIds: string[]
  expectedImpact: string
  estimatedCost: EstimatedCost
  risk: DecisionRisk
  confidence: number
  priority: DecisionPriority
  recommendedAgent: string | null
  requiredApproval: boolean
  status: DecisionStatus
  decidedBy: string | null
  decidedAt: number | null
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

interface DecisionRow {
  id: string
  org_id: string
  project_id: string
  action: DecisionAction
  subject_type: string
  subject_id: string | null
  reason: string
  evidence_ids: string[]
  expected_impact: string
  estimated_cost: EstimatedCost
  risk: DecisionRisk
  confidence: number
  priority: DecisionPriority
  recommended_agent: string | null
  required_approval: boolean
  status: DecisionStatus
  decided_by: string | null
  decided_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

function rowToDecision(r: DecisionRow): IntelligenceDecision {
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
    estimatedCost: r.estimated_cost ?? {},
    risk: r.risk,
    confidence: r.confidence,
    priority: r.priority,
    recommendedAgent: r.recommended_agent,
    requiredApproval: r.required_approval,
    status: r.status,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at ? Number(r.decided_at) : null,
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export interface CreateDecisionInput {
  orgId: string
  projectId: string
  action: DecisionAction
  subjectType: string
  subjectId?: string | null
  reason: string
  evidenceIds: string[]
  expectedImpact: string
  estimatedCost: EstimatedCost
  risk: DecisionRisk
  confidence: number
  priority?: DecisionPriority
  recommendedAgent?: string | null
  requiredApproval: boolean
  expiresInMs?: number
}

export async function createDecision(input: CreateDecisionInput): Promise<IntelligenceDecision> {
  const id = `dec_${randomUUID()}`
  const now = Date.now()
  const expiresAt = input.expiresInMs ? now + input.expiresInMs : null
  await query(
    `INSERT INTO intelligence_decisions (id, org_id, project_id, action, subject_type, subject_id, reason, evidence_ids, expected_impact, estimated_cost, risk, confidence, priority, recommended_agent, required_approval, status, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16, $17, $17)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.action,
      input.subjectType,
      input.subjectId ?? null,
      input.reason,
      JSON.stringify(input.evidenceIds),
      input.expectedImpact,
      JSON.stringify(input.estimatedCost),
      input.risk,
      input.confidence,
      input.priority ?? "normal",
      input.recommendedAgent ?? null,
      input.requiredApproval,
      expiresAt,
      now,
    ],
  )
  return (await getDecision(id, input.orgId))!
}

export async function getDecision(id: string, orgId: string): Promise<IntelligenceDecision | null> {
  const row = await queryOne<DecisionRow>("SELECT * FROM intelligence_decisions WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToDecision(row) : null
}

export async function listDecisions(orgId: string, projectId: string, opts: { status?: DecisionStatus; limit?: number } = {}): Promise<IntelligenceDecision[]> {
  const conditions = ["org_id = $1", "project_id = $2"]
  const params: unknown[] = [orgId, projectId]
  if (opts.status) {
    params.push(opts.status)
    conditions.push(`status = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 50, 200))
  const rows = await query<DecisionRow>(
    `SELECT * FROM intelligence_decisions WHERE ${conditions.join(" AND ")} ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at DESC LIMIT $${params.length}`,
    params,
  )
  return rows.map(rowToDecision)
}

/** The only real path out of `pending` — always by a real, authenticated
 * actor (a human via the API, or 'system' for a DO_NOTHING/MONITOR
 * decision that never required approval in the first place). Never
 * silently auto-approved for an action that `requiredApproval`. */
export async function decideOnDecision(id: string, orgId: string, status: "approved" | "rejected" | "cancelled", decidedBy: string): Promise<IntelligenceDecision | null> {
  const existing = await getDecision(id, orgId)
  if (!existing || existing.status !== "pending") return null
  const now = Date.now()
  await query("UPDATE intelligence_decisions SET status = $1, decided_by = $2, decided_at = $3, updated_at = $3 WHERE id = $4 AND org_id = $5", [status, decidedBy, now, id, orgId])
  return getDecision(id, orgId)
}

export async function markDecisionExecuted(id: string, orgId: string): Promise<void> {
  await query("UPDATE intelligence_decisions SET status = 'executed', updated_at = $1 WHERE id = $2 AND org_id = $3", [Date.now(), id, orgId])
}

/** Real expiry — never silently left pending forever (same discipline
 * as lib/workflow/approval.ts's expireOverdueApprovals()). */
export async function expireOverdueDecisions(orgId: string): Promise<number> {
  const now = Date.now()
  const rows = await query<{ id: string }>("SELECT id FROM intelligence_decisions WHERE org_id = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < $2", [orgId, now])
  if (rows.length === 0) return 0
  await query("UPDATE intelligence_decisions SET status = 'expired', updated_at = $1 WHERE org_id = $2 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < $1", [now, orgId])
  return rows.length
}

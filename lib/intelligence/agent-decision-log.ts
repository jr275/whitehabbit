import "server-only"

/* ================================================================== *
 * AGENT DECISION LOG (§12, ADR-032) — a real, append-only audit trail
 * of every autonomous in-flight agent decision. Distinct from
 * IntelligenceDecision (the strategic "what should we do next" layer,
 * lib/intelligence/decisions.ts): this is the tactical "why did the
 * agent do X, right now, during this run" record enterprise
 * auditability needs.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"
import type { AgentType } from "@/lib/workflow/permissions"

export interface AgentDecisionLogEntry {
  id: string
  orgId: string
  agentRunId: string | null
  agent: AgentType
  decision: string
  reason: string
  evidence: string[]
  policy: string | null
  confidence: number | null
  risk: "low" | "medium" | "high" | "critical" | null
  approvalRequired: boolean
  approvedBy: string | null
  createdAt: number
}

interface LogRow {
  id: string
  org_id: string
  agent_run_id: string | null
  agent: AgentType
  decision: string
  reason: string
  evidence: string[]
  policy: string | null
  confidence: number | null
  risk: "low" | "medium" | "high" | "critical" | null
  approval_required: boolean
  approved_by: string | null
  created_at: string
}

function rowToEntry(r: LogRow): AgentDecisionLogEntry {
  return {
    id: r.id,
    orgId: r.org_id,
    agentRunId: r.agent_run_id,
    agent: r.agent,
    decision: r.decision,
    reason: r.reason,
    evidence: r.evidence ?? [],
    policy: r.policy,
    confidence: r.confidence,
    risk: r.risk,
    approvalRequired: r.approval_required,
    approvedBy: r.approved_by,
    createdAt: Number(r.created_at),
  }
}

/** Real, append-only — never updated, never deleted. Called at every
 * point in this codebase where an agent's action is gated by a real
 * policy (autonomy evaluation, capability check outcome, budget
 * decision) — see lib/workflow/autonomy.ts's call site in
 * lib/content-pipeline/steps.ts for the first wired example. */
export async function logAgentDecision(input: {
  orgId: string
  agentRunId?: string | null
  agent: AgentType
  decision: string
  reason: string
  evidence?: string[]
  policy?: string | null
  confidence?: number | null
  risk?: "low" | "medium" | "high" | "critical" | null
  approvalRequired?: boolean
  approvedBy?: string | null
}): Promise<AgentDecisionLogEntry> {
  const id = `adl_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO agent_decision_logs (id, org_id, agent_run_id, agent, decision, reason, evidence, policy, confidence, risk, approval_required, approved_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      input.orgId,
      input.agentRunId ?? null,
      input.agent,
      input.decision,
      input.reason,
      JSON.stringify(input.evidence ?? []),
      input.policy ?? null,
      input.confidence ?? null,
      input.risk ?? null,
      input.approvalRequired ?? false,
      input.approvedBy ?? null,
      now,
    ],
  )
  return {
    id,
    orgId: input.orgId,
    agentRunId: input.agentRunId ?? null,
    agent: input.agent,
    decision: input.decision,
    reason: input.reason,
    evidence: input.evidence ?? [],
    policy: input.policy ?? null,
    confidence: input.confidence ?? null,
    risk: input.risk ?? null,
    approvalRequired: input.approvalRequired ?? false,
    approvedBy: input.approvedBy ?? null,
    createdAt: now,
  }
}

export async function listDecisionLogForRun(orgId: string, agentRunId: string): Promise<AgentDecisionLogEntry[]> {
  const rows = await query<LogRow>("SELECT * FROM agent_decision_logs WHERE org_id = $1 AND agent_run_id = $2 ORDER BY created_at ASC", [orgId, agentRunId])
  return rows.map(rowToEntry)
}

export async function listRecentDecisionLog(orgId: string, limit = 50): Promise<AgentDecisionLogEntry[]> {
  const rows = await query<LogRow>("SELECT * FROM agent_decision_logs WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2", [orgId, Math.min(limit, 500)])
  return rows.map(rowToEntry)
}

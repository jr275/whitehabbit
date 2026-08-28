import "server-only"

/* ================================================================== *
 * INTELLIGENCE ACTION (§4, §12, ADR-032) — the real execution record
 * for an approved Decision. Deliberately references a real
 * agent_runs row (via workflowEngine) rather than tracking execution
 * state twice — an Action is a thin, auditable pointer from "what was
 * decided" to "what actually ran," never a parallel state machine.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

export type ActionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export interface IntelligenceAction {
  id: string
  orgId: string
  projectId: string
  decisionId: string
  agentRunId: string | null
  status: ActionStatus
  output: Record<string, unknown> | null
  startedAt: number | null
  completedAt: number | null
  createdAt: number
}

interface ActionRow {
  id: string
  org_id: string
  project_id: string
  decision_id: string
  agent_run_id: string | null
  status: ActionStatus
  output: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

function rowToAction(r: ActionRow): IntelligenceAction {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    decisionId: r.decision_id,
    agentRunId: r.agent_run_id,
    status: r.status,
    output: r.output,
    startedAt: r.started_at ? Number(r.started_at) : null,
    completedAt: r.completed_at ? Number(r.completed_at) : null,
    createdAt: Number(r.created_at),
  }
}

export async function createAction(input: { orgId: string; projectId: string; decisionId: string; agentRunId?: string | null; status?: ActionStatus }): Promise<IntelligenceAction> {
  const id = `act_${randomUUID()}`
  const now = Date.now()
  const status = input.status ?? "queued"
  await query(
    `INSERT INTO intelligence_actions (id, org_id, project_id, decision_id, agent_run_id, status, started_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, input.orgId, input.projectId, input.decisionId, input.agentRunId ?? null, status, status === "running" ? now : null, now],
  )
  return (await getAction(id, input.orgId))!
}

export async function getAction(id: string, orgId: string): Promise<IntelligenceAction | null> {
  const row = await queryOne<ActionRow>("SELECT * FROM intelligence_actions WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToAction(row) : null
}

export async function listActionsForDecision(orgId: string, decisionId: string): Promise<IntelligenceAction[]> {
  const rows = await query<ActionRow>("SELECT * FROM intelligence_actions WHERE org_id = $1 AND decision_id = $2 ORDER BY created_at DESC", [orgId, decisionId])
  return rows.map(rowToAction)
}

export async function listActions(orgId: string, projectId: string, opts: { status?: ActionStatus; limit?: number } = {}): Promise<IntelligenceAction[]> {
  const conditions = ["org_id = $1", "project_id = $2"]
  const params: unknown[] = [orgId, projectId]
  if (opts.status) {
    params.push(opts.status)
    conditions.push(`status = $${params.length}`)
  }
  params.push(Math.min(opts.limit ?? 50, 200))
  const rows = await query<ActionRow>(`SELECT * FROM intelligence_actions WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length}`, params)
  return rows.map(rowToAction)
}

export async function completeAction(id: string, orgId: string, status: Extract<ActionStatus, "succeeded" | "failed" | "cancelled">, output?: Record<string, unknown>): Promise<void> {
  await query("UPDATE intelligence_actions SET status = $1, output = $2, completed_at = $3 WHERE id = $4 AND org_id = $5", [status, output ? JSON.stringify(output) : null, Date.now(), id, orgId])
}

import "server-only"

/* ================================================================== *
 * INTELLIGENCE ACTION (§4, §12, ADR-032, ADR-038) — the real execution
 * record for an approved Decision. Deliberately references a real
 * agent_runs row (via workflowEngine) rather than tracking execution
 * state twice — an Action is a thin, auditable pointer from "what was
 * decided" to "what actually ran," never a parallel state machine.
 *
 * 'blocked' (Phase 7) is real and distinct from 'failed': it means no
 * real execution was even attempted — the DecisionActionResolver
 * found no supported execution path, or the PolicyEngine denied it —
 * never a runtime error. createAction() is idempotent per real
 * Decision the same way lib/workflow/repo.ts#createWorkflowRun() is
 * idempotent per (org, pipeline, subject): a real, DB-enforced partial
 * unique index (migrations/0011) is the actual guard, not just an
 * application-level check-then-insert race.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"

const UNIQUE_VIOLATION = "23505"

export type ActionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "blocked"

export interface IntelligenceAction {
  id: string
  orgId: string
  projectId: string
  decisionId: string
  agentRunId: string | null
  status: ActionStatus
  output: Record<string, unknown> | null
  blockedReason: string | null
  retryOfActionId: string | null
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
  blocked_reason: string | null
  retry_of_action_id: string | null
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
    blockedReason: r.blocked_reason,
    retryOfActionId: r.retry_of_action_id,
    startedAt: r.started_at ? Number(r.started_at) : null,
    completedAt: r.completed_at ? Number(r.completed_at) : null,
    createdAt: Number(r.created_at),
  }
}

/** Real, DB-enforced idempotency (§4 of the Phase 7 brief): if an
 * active (queued/running/succeeded/blocked) action already exists for
 * this decision, that SAME row is returned — never a second one.
 * `retryOfActionId` links a fresh attempt back to the terminal
 * (failed/cancelled) action it retries, which is real, valid, and
 * expected to create a new active row. */
export async function createAction(input: { orgId: string; projectId: string; decisionId: string; agentRunId?: string | null; status?: ActionStatus; blockedReason?: string | null; retryOfActionId?: string | null }): Promise<IntelligenceAction> {
  const id = `act_${randomUUID()}`
  const now = Date.now()
  const status = input.status ?? "queued"
  try {
    await query(
      `INSERT INTO intelligence_actions (id, org_id, project_id, decision_id, agent_run_id, status, output, blocked_reason, retry_of_action_id, started_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11)`,
      [
        id,
        input.orgId,
        input.projectId,
        input.decisionId,
        input.agentRunId ?? null,
        status,
        input.blockedReason ?? null,
        input.retryOfActionId ?? null,
        status === "running" ? now : null,
        status === "blocked" || status === "succeeded" ? now : null,
        now,
      ],
    )
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      const existing = await queryOne<ActionRow>(
        "SELECT * FROM intelligence_actions WHERE decision_id = $1 AND org_id = $2 AND status IN ('queued','running','succeeded','blocked') ORDER BY created_at DESC LIMIT 1",
        [input.decisionId, input.orgId],
      )
      if (existing) return rowToAction(existing)
    }
    throw err
  }
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

/** Claims a queued action for real dispatch — the drain tick's own
 * "I am now working on this" marker, distinct from completeAction()'s
 * terminal states. Real bookkeeping only real work should perform. */
export async function markActionRunning(id: string, orgId: string, agentRunId: string | null): Promise<void> {
  await query("UPDATE intelligence_actions SET status = 'running', agent_run_id = $1, started_at = COALESCE(started_at, $2) WHERE id = $3 AND org_id = $4", [agentRunId, Date.now(), id, orgId])
}

export async function completeAction(id: string, orgId: string, status: Extract<ActionStatus, "succeeded" | "failed" | "cancelled">, output?: Record<string, unknown>): Promise<void> {
  await query("UPDATE intelligence_actions SET status = $1, output = $2, completed_at = $3 WHERE id = $4 AND org_id = $5", [status, output ? JSON.stringify(output) : null, Date.now(), id, orgId])
}

/** The real, categorical "never even attempted" terminal state (§9,
 * §2 of the Phase 7 brief) — distinct from completeAction()'s
 * 'failed', which means real execution was attempted and errored. */
export async function blockAction(id: string, orgId: string, reason: string): Promise<void> {
  await query("UPDATE intelligence_actions SET status = 'blocked', blocked_reason = $1, completed_at = $2 WHERE id = $3 AND org_id = $4", [reason, Date.now(), id, orgId])
}

export async function getActionByAgentRun(agentRunId: string, orgId: string): Promise<IntelligenceAction | null> {
  const row = await queryOne<ActionRow>("SELECT * FROM intelligence_actions WHERE agent_run_id = $1 AND org_id = $2", [agentRunId, orgId])
  return row ? rowToAction(row) : null
}

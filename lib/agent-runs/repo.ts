import "server-only"

/* ================================================================== *
 * AGENT RUNS — repository + a small ergonomic step-runner. Org- (and
 * for runs, project-) scoped throughout. See docs/adr/ADR-016.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { AgentRun, AgentRunPipeline, AgentRunStatus, AgentRunStep, AgentRunStepStatus, AgentRunSubjectType } from "./model"

interface AgentRunSqlRow {
  id: string
  org_id: string
  project_id: string
  pipeline: AgentRunPipeline
  subject_type: AgentRunSubjectType
  subject_id: string
  status: AgentRunStatus
  error_reason: string | null
  cost_usd: number | null
  input_tokens: number | null
  output_tokens: number | null
  model: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  created_at: string
}

function rowToRun(r: AgentRunSqlRow): AgentRun {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    pipeline: r.pipeline,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    status: r.status,
    errorReason: r.error_reason,
    costUsd: r.cost_usd,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    model: r.model,
    startedAt: Number(r.started_at),
    completedAt: r.completed_at ? Number(r.completed_at) : null,
    durationMs: r.duration_ms,
    createdAt: Number(r.created_at),
  }
}

export async function createAgentRun(input: {
  orgId: string
  projectId: string
  pipeline: AgentRunPipeline
  subjectType: AgentRunSubjectType
  subjectId: string
}): Promise<AgentRun> {
  const id = `run_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO agent_runs (id, org_id, project_id, pipeline, subject_type, subject_id, status, started_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, $7)`,
    [id, input.orgId, input.projectId, input.pipeline, input.subjectType, input.subjectId, now],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    pipeline: input.pipeline,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    status: "running",
    errorReason: null,
    costUsd: null,
    inputTokens: null,
    outputTokens: null,
    model: null,
    startedAt: now,
    completedAt: null,
    durationMs: null,
    createdAt: now,
  }
}

export async function finalizeAgentRun(
  id: string,
  patch: { status: AgentRunStatus; errorReason?: string; costUsd?: number; inputTokens?: number; outputTokens?: number; model?: string },
): Promise<void> {
  const completedAt = Date.now()
  const run = await queryOne<{ started_at: string }>("SELECT started_at FROM agent_runs WHERE id = $1", [id])
  const durationMs = run ? completedAt - Number(run.started_at) : null
  await query(
    `UPDATE agent_runs SET status = $1, error_reason = $2, cost_usd = $3, input_tokens = $4, output_tokens = $5, model = $6, completed_at = $7, duration_ms = $8 WHERE id = $9`,
    [patch.status, patch.errorReason ?? null, patch.costUsd ?? null, patch.inputTokens ?? null, patch.outputTokens ?? null, patch.model ?? null, completedAt, durationMs, id],
  )
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the run doesn't belong to orgId. */
export async function getAgentRun(id: string, orgId: string): Promise<AgentRun | null> {
  const row = await queryOne<AgentRunSqlRow>("SELECT * FROM agent_runs WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToRun(row) : null
}

export async function listAgentRunsForSubject(orgId: string, subjectType: AgentRunSubjectType, subjectId: string): Promise<AgentRun[]> {
  const rows = await query<AgentRunSqlRow>(
    "SELECT * FROM agent_runs WHERE org_id = $1 AND subject_type = $2 AND subject_id = $3 ORDER BY started_at DESC",
    [orgId, subjectType, subjectId],
  )
  return rows.map(rowToRun)
}

interface AgentRunStepSqlRow {
  id: string
  org_id: string
  agent_run_id: string
  step: string
  sequence: number
  status: AgentRunStepStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  cost_usd: number | null
  input_tokens: number | null
  output_tokens: number | null
  model: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  created_at: string
}

function rowToStep(r: AgentRunStepSqlRow): AgentRunStep {
  return {
    id: r.id,
    orgId: r.org_id,
    agentRunId: r.agent_run_id,
    step: r.step,
    sequence: r.sequence,
    status: r.status,
    input: r.input,
    output: r.output,
    error: r.error,
    costUsd: r.cost_usd,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    model: r.model,
    startedAt: r.started_at ? Number(r.started_at) : null,
    completedAt: r.completed_at ? Number(r.completed_at) : null,
    durationMs: r.duration_ms,
    createdAt: Number(r.created_at),
  }
}

export async function listStepsForRun(agentRunId: string, orgId: string): Promise<AgentRunStep[]> {
  const rows = await query<AgentRunStepSqlRow>("SELECT * FROM agent_run_steps WHERE agent_run_id = $1 AND org_id = $2 ORDER BY sequence ASC", [
    agentRunId,
    orgId,
  ])
  return rows.map(rowToStep)
}

/** Ergonomic step runner: records a real queued->running->completed/
 * failed step around `fn`, never swallowing an error — it always
 * re-throws after recording the failure, so the caller's own
 * try/catch decides how the overall run responds (mirrors
 * lib/agent/runtime.ts's own executeTask() discipline: every failure
 * is persisted with its real reason before propagating). */
export interface StepResult {
  output: Record<string, unknown>
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  model?: string
}

export async function runStep(
  orgId: string,
  agentRunId: string,
  sequence: number,
  step: string,
  input: Record<string, unknown> | null,
  fn: () => Promise<StepResult>,
): Promise<StepResult> {
  const id = `step_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO agent_run_steps (id, org_id, agent_run_id, step, sequence, status, input, started_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $7)`,
    [id, orgId, agentRunId, step, sequence, input ? JSON.stringify(input) : null, now],
  )
  try {
    const result = await fn()
    const completedAt = Date.now()
    await query(
      `UPDATE agent_run_steps SET status = 'completed', output = $1, cost_usd = $2, input_tokens = $3, output_tokens = $4, model = $5, completed_at = $6, duration_ms = $7 WHERE id = $8`,
      [JSON.stringify(result.output), result.costUsd ?? null, result.inputTokens ?? null, result.outputTokens ?? null, result.model ?? null, completedAt, completedAt - now, id],
    )
    return result
  } catch (err) {
    const completedAt = Date.now()
    const message = err instanceof Error ? err.message : String(err)
    await query(`UPDATE agent_run_steps SET status = 'failed', error = $1, completed_at = $2, duration_ms = $3 WHERE id = $4`, [
      message,
      completedAt,
      completedAt - now,
      id,
    ])
    throw err
  }
}

export async function skipStep(orgId: string, agentRunId: string, sequence: number, step: string, reason: string): Promise<void> {
  const id = `step_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO agent_run_steps (id, org_id, agent_run_id, step, sequence, status, output, started_at, completed_at, duration_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, 'skipped', $6, $7, $7, 0, $7)`,
    [id, orgId, agentRunId, step, sequence, JSON.stringify({ reason }), now],
  )
}

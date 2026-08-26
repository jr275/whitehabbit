import "server-only"

/* ================================================================== *
 * WORKFLOW — Postgres persistence (the concrete implementation behind
 * lib/workflow/engine.ts's PostgresWorkflowEngine). Same physical
 * tables Phase 3 introduced (agent_runs/agent_run_steps), extended —
 * see migrations/0004_durable_workflows.sql and ADR-017 for why this
 * is not a parallel ledger.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import { assertValidTransition } from "./state-machine"
import { buildWorkflowIdempotencyKey } from "./idempotency"
import type {
  BudgetPolicy,
  BudgetUsage,
  WorkflowCheckpoint,
  WorkflowPipeline,
  WorkflowPriority,
  WorkflowRun,
  WorkflowStatus,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowSubjectType,
} from "./types"

/** Postgres unique_violation */
const UNIQUE_VIOLATION = "23505"

interface RunRow {
  id: string
  org_id: string
  project_id: string
  pipeline: WorkflowPipeline
  subject_type: WorkflowSubjectType
  subject_id: string
  status: WorkflowStatus
  error_reason: string | null
  idempotency_key: string | null
  attempt_count: number
  max_attempts: number
  available_at: string | null
  priority: WorkflowPriority
  budget: BudgetPolicy | null
  usage: BudgetUsage | null
  checkpoint: WorkflowCheckpoint | null
  trace_id: string | null
  cost_usd: number | null
  input_tokens: number | null
  output_tokens: number | null
  model: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  created_at: string
}

function rowToRun(r: RunRow): WorkflowRun {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    pipeline: r.pipeline,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    status: r.status,
    errorReason: r.error_reason,
    idempotencyKey: r.idempotency_key,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    availableAt: r.available_at ? Number(r.available_at) : null,
    priority: r.priority,
    budget: r.budget,
    usage: r.usage,
    checkpoint: r.checkpoint,
    traceId: r.trace_id,
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

export interface CreateWorkflowRunInput {
  orgId: string
  projectId: string
  pipeline: WorkflowPipeline
  subjectType: WorkflowSubjectType
  subjectId: string
  initialStatus?: WorkflowStatus // 'running' (sync path, default) or 'queued' (queue path)
  priority?: WorkflowPriority
  budget?: BudgetPolicy
  maxAttempts?: number
  traceId?: string
}

/** Real idempotent creation (§6): if an ACTIVE run already exists for
 * this (org, pipeline, subject), returns it instead of creating a
 * second one — enforced by a real partial UNIQUE index, not just this
 * check (a concurrent insert racing this SELECT still can't create a
 * duplicate; the INSERT's unique_violation is caught and the existing
 * row re-fetched). */
export async function createWorkflowRun(input: CreateWorkflowRunInput): Promise<WorkflowRun> {
  const idempotencyKey = buildWorkflowIdempotencyKey(input.orgId, input.pipeline, input.subjectId)
  const id = `run_${randomUUID()}`
  const now = Date.now()
  const status = input.initialStatus ?? "running"
  const traceId = input.traceId ?? `trace_${randomUUID()}`

  try {
    await query(
      `INSERT INTO agent_runs (id, org_id, project_id, pipeline, subject_type, subject_id, status, idempotency_key, attempt_count, max_attempts, priority, budget, usage, trace_id, started_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, $12, $13, $14, $14)`,
      [
        id,
        input.orgId,
        input.projectId,
        input.pipeline,
        input.subjectType,
        input.subjectId,
        status,
        idempotencyKey,
        input.maxAttempts ?? 3,
        input.priority ?? "normal",
        input.budget ? JSON.stringify(input.budget) : null,
        JSON.stringify({ tokens: 0, costUsd: 0, durationMs: 0, steps: 0 }),
        traceId,
        now,
      ],
    )
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      const existing = await queryOne<RunRow>(
        "SELECT * FROM agent_runs WHERE idempotency_key = $1 AND status NOT IN ('succeeded','failed','cancelled')",
        [idempotencyKey],
      )
      if (existing) return rowToRun(existing)
    }
    throw err
  }

  return (await getWorkflowRun(id, input.orgId))!
}

/** Org-scoped by construction: returns null (never another org's row)
 * if the run doesn't belong to orgId. */
export async function getWorkflowRun(id: string, orgId: string): Promise<WorkflowRun | null> {
  const row = await queryOne<RunRow>("SELECT * FROM agent_runs WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToRun(row) : null
}

export async function getActiveWorkflowRunForSubject(orgId: string, pipeline: WorkflowPipeline, subjectId: string): Promise<WorkflowRun | null> {
  const idempotencyKey = buildWorkflowIdempotencyKey(orgId, pipeline, subjectId)
  const row = await queryOne<RunRow>(
    "SELECT * FROM agent_runs WHERE idempotency_key = $1 AND status NOT IN ('succeeded','failed','cancelled')",
    [idempotencyKey],
  )
  return row ? rowToRun(row) : null
}

export async function listWorkflowRunsForSubject(orgId: string, subjectType: WorkflowSubjectType, subjectId: string): Promise<WorkflowRun[]> {
  const rows = await query<RunRow>(
    "SELECT * FROM agent_runs WHERE org_id = $1 AND subject_type = $2 AND subject_id = $3 ORDER BY started_at DESC",
    [orgId, subjectType, subjectId],
  )
  return rows.map(rowToRun)
}

export async function listWorkflowRuns(orgId: string, opts: { status?: WorkflowStatus; pipeline?: WorkflowPipeline; limit?: number } = {}): Promise<WorkflowRun[]> {
  const limit = Math.min(opts.limit ?? 50, 200)
  const conditions = ["org_id = $1"]
  const params: unknown[] = [orgId]
  if (opts.status) {
    params.push(opts.status)
    conditions.push(`status = $${params.length}`)
  }
  if (opts.pipeline) {
    params.push(opts.pipeline)
    conditions.push(`pipeline = $${params.length}`)
  }
  params.push(limit)
  const rows = await query<RunRow>(`SELECT * FROM agent_runs WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC LIMIT $${params.length}`, params)
  return rows.map(rowToRun)
}

/** The real, DB-maintained count of ACTIVE runs for a tenant+pipeline —
 * what lib/workflow/queue.ts's concurrency limiter checks before
 * dequeuing more work (§9). */
export async function countActiveRuns(orgId: string, pipeline: WorkflowPipeline): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT count(*) FROM agent_runs WHERE org_id = $1 AND pipeline = $2 AND status IN ('running','retrying')",
    [orgId, pipeline],
  )
  return Number(row?.count ?? 0)
}

/** Every status write goes through here — validates the transition
 * first (§3), so an invalid one fails loudly instead of silently
 * corrupting the run's history. */
export async function transitionWorkflowRun(
  id: string,
  orgId: string,
  toStatus: WorkflowStatus,
  patch: { errorReason?: string | null; availableAt?: number | null; checkpoint?: WorkflowCheckpoint; costUsd?: number; inputTokens?: number; outputTokens?: number; model?: string } = {},
): Promise<WorkflowRun> {
  const current = await getWorkflowRun(id, orgId)
  if (!current) throw new Error(`Workflow run ${id} not found for this organization.`)
  assertValidTransition(current.status, toStatus)

  const isTerminalNow = toStatus === "succeeded" || toStatus === "failed" || toStatus === "cancelled"
  const now = Date.now()
  const completedAt = isTerminalNow ? now : null
  const durationMs = isTerminalNow ? now - current.startedAt : null

  await query(
    `UPDATE agent_runs SET status = $1, error_reason = $2, available_at = $3, checkpoint = COALESCE($4, checkpoint),
       cost_usd = COALESCE($5, cost_usd), input_tokens = COALESCE($6, input_tokens), output_tokens = COALESCE($7, output_tokens), model = COALESCE($8, model),
       completed_at = COALESCE($9, completed_at), duration_ms = COALESCE($10, duration_ms)
     WHERE id = $11 AND org_id = $12`,
    [
      toStatus,
      patch.errorReason ?? null,
      patch.availableAt ?? null,
      patch.checkpoint ? JSON.stringify(patch.checkpoint) : null,
      patch.costUsd ?? null,
      patch.inputTokens ?? null,
      patch.outputTokens ?? null,
      patch.model ?? null,
      completedAt,
      durationMs,
      id,
      orgId,
    ],
  )
  return (await getWorkflowRun(id, orgId))!
}

/** Pure metadata — never a state transition, never validated against
 * the state machine. The step row itself is the real checkpoint (see
 * completeStep()); this is a denormalized "where did we last get to"
 * marker on the run for quick reads (e.g. the Agent Control Center list
 * view) without joining to agent_run_steps. */
export async function updateCheckpoint(id: string, orgId: string, checkpoint: WorkflowCheckpoint): Promise<void> {
  await query("UPDATE agent_runs SET checkpoint = $1 WHERE id = $2 AND org_id = $3", [JSON.stringify(checkpoint), id, orgId])
}

export async function incrementAttempt(id: string, orgId: string): Promise<void> {
  await query("UPDATE agent_runs SET attempt_count = attempt_count + 1 WHERE id = $1 AND org_id = $2", [id, orgId])
}

export async function recordUsage(id: string, orgId: string, usage: BudgetUsage): Promise<void> {
  await query("UPDATE agent_runs SET usage = $1 WHERE id = $2 AND org_id = $3", [JSON.stringify(usage), id, orgId])
}

/* ==================== steps ==================== */

interface StepRow {
  id: string
  org_id: string
  agent_run_id: string
  step: string
  sequence: number
  status: WorkflowStepStatus
  attempt_count: number
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  checkpoint_data: Record<string, unknown> | null
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

function rowToStep(r: StepRow): WorkflowStep {
  return {
    id: r.id,
    orgId: r.org_id,
    workflowRunId: r.agent_run_id,
    step: r.step,
    sequence: r.sequence,
    status: r.status,
    attemptCount: r.attempt_count,
    input: r.input,
    output: r.output,
    checkpointData: r.checkpoint_data,
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

/** The real checkpoint-resume lookup (§4): a step already `succeeded`
 * for this exact (workflowRunId, step, sequence) is returned as-is —
 * the caller (lib/workflow/engine.ts's runStep) skips re-executing it
 * and reuses its checkpointData/output directly. */
export async function getStep(workflowRunId: string, step: string, sequence: number, orgId: string): Promise<WorkflowStep | null> {
  const row = await queryOne<StepRow>("SELECT * FROM agent_run_steps WHERE agent_run_id = $1 AND step = $2 AND sequence = $3 AND org_id = $4", [
    workflowRunId,
    step,
    sequence,
    orgId,
  ])
  return row ? rowToStep(row) : null
}

export async function listSteps(workflowRunId: string, orgId: string): Promise<WorkflowStep[]> {
  const rows = await query<StepRow>("SELECT * FROM agent_run_steps WHERE agent_run_id = $1 AND org_id = $2 ORDER BY sequence ASC", [workflowRunId, orgId])
  return rows.map(rowToStep)
}

export async function startStep(orgId: string, workflowRunId: string, step: string, sequence: number, input: Record<string, unknown> | null): Promise<WorkflowStep> {
  const id = `step_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO agent_run_steps (id, org_id, agent_run_id, step, sequence, status, attempt_count, input, started_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'running', 1, $6, $7, $7)
     ON CONFLICT (agent_run_id, sequence) DO UPDATE SET status = 'running', attempt_count = agent_run_steps.attempt_count + 1, started_at = $7`,
    [id, orgId, workflowRunId, step, sequence, input ? JSON.stringify(input) : null, now],
  )
  return (await getStep(workflowRunId, step, sequence, orgId))!
}

export async function completeStep(
  id: string,
  patch: { output: Record<string, unknown>; checkpointData?: Record<string, unknown>; costUsd?: number; inputTokens?: number; outputTokens?: number; model?: string },
): Promise<void> {
  const now = Date.now()
  const row = await queryOne<{ started_at: string }>("SELECT started_at FROM agent_run_steps WHERE id = $1", [id])
  const durationMs = row ? now - Number(row.started_at) : null
  await query(
    `UPDATE agent_run_steps SET status = 'succeeded', output = $1, checkpoint_data = $2, cost_usd = $3, input_tokens = $4, output_tokens = $5, model = $6, completed_at = $7, duration_ms = $8 WHERE id = $9`,
    [JSON.stringify(patch.output), patch.checkpointData ? JSON.stringify(patch.checkpointData) : null, patch.costUsd ?? null, patch.inputTokens ?? null, patch.outputTokens ?? null, patch.model ?? null, now, durationMs, id],
  )
}

export async function failStep(id: string, error: string, status: "failed" | "retrying" = "failed"): Promise<void> {
  const now = Date.now()
  const row = await queryOne<{ started_at: string }>("SELECT started_at FROM agent_run_steps WHERE id = $1", [id])
  const durationMs = row ? now - Number(row.started_at) : null
  await query(`UPDATE agent_run_steps SET status = $1, error = $2, completed_at = $3, duration_ms = $4 WHERE id = $5`, [status, error, now, durationMs, id])
}

export async function skipStep(orgId: string, workflowRunId: string, step: string, sequence: number, reason: string): Promise<void> {
  const id = `step_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO agent_run_steps (id, org_id, agent_run_id, step, sequence, status, output, started_at, completed_at, duration_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, 'skipped', $6, $7, $7, 0, $7)
     ON CONFLICT (agent_run_id, sequence) DO NOTHING`,
    [id, orgId, workflowRunId, step, sequence, JSON.stringify({ reason }), now],
  )
}

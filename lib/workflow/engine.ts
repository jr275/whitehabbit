import "server-only"

/* ================================================================== *
 * WORKFLOW ENGINE (ADR-017) — the provider-independent interface
 * domain code (orchestrators, API routes) depends on. `PostgresWorkflowEngine`
 * is the one concrete implementation today; a future Temporal-backed
 * implementation would satisfy the exact same interface with zero
 * change to any orchestrator.
 *
 * `runStep()` is the heart of durability: idempotent (skips
 * re-execution of an already-succeeded step — real checkpoint-resume,
 * §4), retried in-process with real backoff+jitter (§5), and budget-
 * checked after every step (§10).
 * ================================================================== */

import { assertWithinBudget, emptyUsage } from "./budget"
import { resolveBudgetPolicy } from "./budget-policy"
import { computeBackoffMs, DEFAULT_RETRY_POLICY, isRetryableError } from "./retry"
import * as repo from "./repo"
import { assertValidTransition } from "./state-machine"
import type {
  BudgetPolicy,
  BudgetUsage,
  RetryPolicy,
  WorkflowPipeline,
  WorkflowPriority,
  WorkflowRun,
  WorkflowStatus,
  WorkflowSubjectType,
} from "./types"

export interface StepResult {
  output: Record<string, unknown>
  /** small, real, resumable state a future resume would need — never
   * the full heavy artifact (that's persisted separately by the
   * caller, e.g. content_artifacts) — just enough to skip re-work. */
  checkpointData?: Record<string, unknown>
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  model?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface WorkflowEngine {
  start(input: {
    orgId: string
    projectId: string
    pipeline: WorkflowPipeline
    subjectType: WorkflowSubjectType
    subjectId: string
    initialStatus?: WorkflowStatus
    priority?: WorkflowPriority
    budget?: BudgetPolicy
  }): Promise<WorkflowRun>
  getStatus(id: string, orgId: string): Promise<WorkflowRun | null>
  cancel(id: string, orgId: string): Promise<WorkflowRun>
  pause(id: string, orgId: string): Promise<WorkflowRun>
  resume(id: string, orgId: string): Promise<WorkflowRun>
  retry(id: string, orgId: string): Promise<WorkflowRun>
}

class PostgresWorkflowEngineImpl implements WorkflowEngine {
  async start(input: Parameters<WorkflowEngine["start"]>[0]): Promise<WorkflowRun> {
    // §6 resolution: explicit override -> project_budgets -> DEFAULT_BUDGET
    // (lib/workflow/budget-policy.ts) — never a hardcoded default when a
    // real project-level override exists.
    const budget = await resolveBudgetPolicy(input.orgId, input.projectId, input.budget)
    return repo.createWorkflowRun({ ...input, budget })
  }

  async getStatus(id: string, orgId: string): Promise<WorkflowRun | null> {
    return repo.getWorkflowRun(id, orgId)
  }

  async cancel(id: string, orgId: string): Promise<WorkflowRun> {
    return repo.transitionWorkflowRun(id, orgId, "cancelled")
  }

  async pause(id: string, orgId: string): Promise<WorkflowRun> {
    return repo.transitionWorkflowRun(id, orgId, "paused")
  }

  async resume(id: string, orgId: string): Promise<WorkflowRun> {
    return repo.transitionWorkflowRun(id, orgId, "running")
  }

  /** A human/API-triggered manual retry of a terminal FAILED/TIMED_OUT
   * run — distinct from the automatic in-process retry inside
   * runStep(). The state machine only allows FAILED/TIMED_OUT ->
   * RETRYING -> RUNNING (never a direct FAILED -> RUNNING jump, §3), so
   * this makes both transitions as one durable action. Already-succeeded
   * steps are skipped via the checkpoint lookup exactly as an automatic
   * retry would skip them. */
  async retry(id: string, orgId: string): Promise<WorkflowRun> {
    await repo.incrementAttempt(id, orgId)
    await repo.transitionWorkflowRun(id, orgId, "retrying")
    return repo.transitionWorkflowRun(id, orgId, "running")
  }
}

export const workflowEngine: WorkflowEngine = new PostgresWorkflowEngineImpl()

/** The checkpointed, idempotent, retried, budget-checked step runner
 * every orchestrator step calls. Never re-executes a step that already
 * succeeded for this exact run (checkpoint-resume, §4); retries a
 * transient failure in-process with real backoff+jitter up to the
 * step's own retry policy (§5); accumulates and enforces the run's
 * budget after every attempt (§10). */
export async function runStep(
  run: WorkflowRun,
  sequence: number,
  step: string,
  input: Record<string, unknown> | null,
  fn: () => Promise<StepResult>,
  retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<StepResult> {
  const existing = await repo.getStep(run.id, step, sequence, run.orgId)
  if (existing && existing.status === "succeeded") {
    // real resume: this exact step already completed for this run —
    // reuse its persisted checkpoint instead of doing the work again.
    return {
      output: existing.output ?? {},
      checkpointData: existing.checkpointData ?? undefined,
      costUsd: existing.costUsd ?? undefined,
      inputTokens: existing.inputTokens ?? undefined,
      outputTokens: existing.outputTokens ?? undefined,
      model: existing.model ?? undefined,
    }
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
    const stepRow = await repo.startStep(run.orgId, run.id, step, sequence, input)
    try {
      const result = await fn()
      await repo.completeStep(stepRow.id, result)

      const usage = addUsage(run.usage ?? emptyUsage(), {
        tokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
        costUsd: result.costUsd ?? 0,
        durationMs: Date.now() - run.startedAt,
        steps: 1,
      })
      await repo.recordUsage(run.id, run.orgId, usage)
      if (run.budget) assertWithinBudget(usage, run.budget) // throws BudgetExceededError — never silently continues (§10)
      run.usage = usage // keep the in-memory run object current for subsequent steps in the same orchestrator call

      // checkpointing is metadata, not a state transition — the step row
      // itself (already durably completeStep()'d above) is the real
      // checkpoint; this is a denormalized "where did we last get to"
      // marker on the run for quick reads, written without going through
      // the state machine (the run's own status is unchanged by it).
      await repo.updateCheckpoint(run.id, run.orgId, { lastCompletedStep: step, lastCompletedSequence: sequence })
      return result
    } catch (err) {
      lastError = err
      const retryable = isRetryableError(err) && attempt < retryPolicy.maxAttempts
      const message = err instanceof Error ? err.message : String(err)
      await repo.failStep(stepRow.id, message, retryable ? "retrying" : "failed")
      if (!retryable) throw err
      await sleep(computeBackoffMs(attempt, retryPolicy))
    }
  }
  throw lastError
}

function addUsage(usage: BudgetUsage, delta: Partial<BudgetUsage>): BudgetUsage {
  return {
    tokens: usage.tokens + (delta.tokens ?? 0),
    costUsd: usage.costUsd + (delta.costUsd ?? 0),
    durationMs: usage.durationMs + (delta.durationMs ?? 0),
    steps: usage.steps + (delta.steps ?? 0),
  }
}

/** Finalizes a run to a terminal state — validated by the same state
 * machine every other transition goes through. */
export async function finalizeWorkflow(
  id: string,
  orgId: string,
  status: Extract<WorkflowStatus, "succeeded" | "failed" | "cancelled">,
  patch: { errorReason?: string; costUsd?: number; inputTokens?: number; outputTokens?: number; model?: string } = {},
): Promise<WorkflowRun> {
  return repo.transitionWorkflowRun(id, orgId, status, patch)
}

/** Marks a run WAITING_APPROVAL — the only path into that state, so a
 * caller can never invent an approval-gated pause without a real,
 * durable approvals row (see lib/workflow/approval.ts). */
export async function markWaitingApproval(id: string, orgId: string): Promise<WorkflowRun> {
  return repo.transitionWorkflowRun(id, orgId, "waiting_approval")
}

export { assertValidTransition }

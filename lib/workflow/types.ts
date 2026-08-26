/* ================================================================== *
 * WORKFLOW — provider-independent domain types (ADR-017). Domain code
 * (orchestrators, API routes, UI) depends only on these types and on
 * lib/workflow/engine.ts's WorkflowEngine interface — never on
 * Postgres-specific SQL, a queue vendor, or (when one is adopted) the
 * Temporal SDK. See docs/architecture/phase-4-plan.md.
 * ================================================================== */

/** The canonical 10-state workflow machine (§3). Supersedes Phase 3's
 * narrower agent_runs status set — see lib/workflow/state-machine.ts
 * for the transition table and migrations/0004_durable_workflows.sql
 * for how existing rows were normalized into this vocabulary. */
export type WorkflowStatus =
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "waiting_approval"
  | "retrying"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out"

export type WorkflowStepStatus = "queued" | "running" | "succeeded" | "failed" | "skipped" | "retrying"

/* "trend_analysis" (Phase 5B, §16, ADR-024) is deliberately never
 * dispatched through the step-job queue (lib/workflow/step-worker.ts) —
 * it's a fast, deterministic scan over already-persisted signals/
 * observations, not a slow crawl or LLM call, so it runs synchronously
 * within a single workflowEngine.start()+runStep()+finalizeWorkflow()
 * call (see lib/intelligence/trend-opportunity.ts). It still gets a
 * real WorkflowRun row for the same reason every other real pipeline
 * does: tenant-scoped observability and a real provenance FK for the
 * opportunities it creates. */
export type WorkflowPipeline = "website_discovery" | "content_generation" | "trend_analysis"
export type WorkflowSubjectType = "website" | "opportunity" | "project"
export type WorkflowPriority = "critical" | "high" | "normal" | "low" | "background"

export interface BudgetPolicy {
  maxTokens?: number
  maxCostUsd?: number
  maxDurationMs?: number
  maxSteps?: number
}

export interface BudgetUsage {
  tokens: number
  costUsd: number
  durationMs: number
  steps: number
}

export interface RetryPolicy {
  maxAttempts: number
  baseMs: number
  backoffMultiplier: number
  maxBackoffMs: number
}

export interface WorkflowCheckpoint {
  lastCompletedStep: string | null
  lastCompletedSequence: number
}

export interface WorkflowRun {
  id: string
  orgId: string
  projectId: string
  pipeline: WorkflowPipeline
  subjectType: WorkflowSubjectType
  subjectId: string
  status: WorkflowStatus
  errorReason: string | null
  idempotencyKey: string | null
  attemptCount: number
  maxAttempts: number
  availableAt: number | null
  priority: WorkflowPriority
  budget: BudgetPolicy | null
  usage: BudgetUsage | null
  checkpoint: WorkflowCheckpoint | null
  traceId: string | null
  costUsd: number | null
  inputTokens: number | null
  outputTokens: number | null
  model: string | null
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  createdAt: number
}

export interface WorkflowStep {
  id: string
  orgId: string
  workflowRunId: string
  step: string
  sequence: number
  status: WorkflowStepStatus
  attemptCount: number
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  checkpointData: Record<string, unknown> | null
  error: string | null
  costUsd: number | null
  inputTokens: number | null
  outputTokens: number | null
  model: string | null
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
  createdAt: number
}

export class BudgetExceededError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "BudgetExceededError"
  }
}

export class InvalidWorkflowTransitionError extends Error {
  constructor(from: WorkflowStatus, to: WorkflowStatus) {
    super(`Invalid workflow state transition: ${from} -> ${to}`)
    this.name = "InvalidWorkflowTransitionError"
  }
}

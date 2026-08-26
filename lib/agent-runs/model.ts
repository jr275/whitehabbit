/* ================================================================== *
 * AGENT RUNS — domain types for the project-level pipeline ledger.
 * See docs/adr/ADR-016 for why this is a parallel structure to
 * lib/workforce/model.ts's WorkerExecution, not a reuse of it.
 * ================================================================== */

export type AgentRunPipeline = "website_discovery" | "content_generation"
export type AgentRunSubjectType = "website" | "opportunity"
export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "blocked" | "pending_approval"
export type AgentRunStepStatus = "queued" | "running" | "completed" | "failed" | "skipped"

export interface AgentRun {
  id: string
  orgId: string
  projectId: string
  pipeline: AgentRunPipeline
  subjectType: AgentRunSubjectType
  subjectId: string
  status: AgentRunStatus
  errorReason: string | null
  costUsd: number | null
  inputTokens: number | null
  outputTokens: number | null
  model: string | null
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  createdAt: number
}

export interface AgentRunStep {
  id: string
  orgId: string
  agentRunId: string
  step: string
  sequence: number
  status: AgentRunStepStatus
  /** small, non-secret step input/output — never a credential or token */
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
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

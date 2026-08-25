/* ================================================================== *
 * AGENT RUNTIME TYPES — the real execution vocabulary.
 *
 * Definition (Worker/Skill/Tool config) vs Runtime (Task, Execution,
 * Event, Output, BusinessEvent, Metric) are kept as distinct concerns,
 * per the brief:
 *
 *   Worker -> Trigger -> Task -> Planner -> Skill -> Tool ->
 *   External System -> Observation -> Next Decision -> Output ->
 *   Business Event -> Metric -> Outcome
 *
 * Client-facing shapes (Worker, WorkerTask, WorkerExecution,
 * WorkerOutput, WorkerEvent) still live in lib/workforce/model.ts —
 * this file adds what the SERVER needs to actually run a skill against
 * a tool and does not depend on any client code.
 * ================================================================== */

import type { SkillCategory, WorkerIntegrationConfig } from "@/lib/workforce/model"

/* ---- the real slice of a Worker's definition a skill actually needs
 * to reason with — mission/objectives/behaviors/knowledge, resolved
 * from the real stored Worker row by the runtime before execute() is
 * called. Never fabricated; a worker with an empty mission or no
 * knowledge sources yields empty arrays/strings here, not placeholder
 * text. */
export interface WorkerContext {
  mission: string
  objectives: string[]
  behaviors: { condition: string; action: string }[]
  knowledge: { id: string; name: string; type: string; content?: string }[]
  /** The real, persisted per-action permission decisions from Studio's
   * Integrations step — runToolAction() (lib/agent/tool-runner.ts)
   * reads this to decide allow/deny/requires_approval for a connector
   * action, ahead of the blanket HIGH_RISK_PERMISSIONS rule. */
  integrations: WorkerIntegrationConfig[]
}

/* ---- permission / risk vocabulary (section 16) ---- */
export type ToolPermission = "read" | "write" | "publish" | "delete" | "financial" | "external_communication"
export type RiskLevel = "low" | "medium" | "high" | "critical"

/* ---- structured, distinguishable failure reasons — never swallowed
 * into one generic "it failed" string. Threaded from a tool's result,
 * through the skill that called it, onto the persisted Execution row,
 * and out to the client via the WorkerEvent payload. */
export type ExecutionReasonCode =
  | "missing_credential" // a required credential was never configured
  | "invalid_credential" // a credential is configured but the provider rejected it
  | "provider_error" // the external system reached out and failed (network, 5xx, timeout)
  | "execution_error" // the skill's own logic failed (e.g. unparseable model output)

/* ---- tools: real, invocable capabilities ---- */
export interface ToolActionResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  errorCode?: Exclude<ExecutionReasonCode, "missing_credential">
  blocked?: boolean
  blockedReason?: string
  /** real, measurable facts about this call — never estimated */
  durationMs: number
  costUsd?: number
  /** Section 8 — a real provider-supplied Retry-After hint (parsed
   * from the HTTP header, in ms), set only on a genuine 429/503.
   * lib/agent/retry.ts's withRetry() waits at least this long before
   * the next attempt instead of guessing a backoff — never invented
   * when the provider didn't actually send one. */
  retryAfterMs?: number
}

export interface ToolContext {
  workerId: string
  executionId: string
  /** emit a real runtime event as this call happens */
  emit: (type: RuntimeEventType, payload: Record<string, unknown>) => void
  /** This Worker's real, persisted per-action permission config — see
   * WorkerContext.integrations. runToolAction() (lib/agent/tool-
   * runner.ts) is the only real consumer; a tool's own run() never
   * needs to look at this itself. */
  integrations?: WorkerIntegrationConfig[]
}

export interface ToolAction {
  id: string
  label: string
  permission: ToolPermission
  riskLevel: RiskLevel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (input: any, ctx: ToolContext) => Promise<ToolActionResult<any>>
}

export interface ToolDefinition {
  id: string
  name: string
  provider: string
  description: string
  /** a REAL check — env var presence, stored credential, etc. Never hardcoded true. */
  isConnected: () => boolean
  notConnectedReason?: string
  actions: ToolAction[]
}

/* ---- skills: executable contracts, not metadata ---- */
export interface SkillInputField {
  key: string
  label: string
  type: "text" | "textarea"
  required: boolean
  placeholder?: string
}

export interface SourceRecord {
  title: string
  url: string
  provider: string
  snippet?: string
}

export interface SkillExecutionResult {
  /** structured, machine-readable result — the real product of the skill */
  structured: unknown
  /** human-readable rendering of `structured`, for the existing output UI */
  summary: string
  sources: SourceRecord[]
  model?: string
  inputTokens?: number
  outputTokens?: number
  /** which LLM provider produced model/inputTokens/outputTokens — cost
   * lookup keys off this so one provider's rate is never applied to
   * another's tokens. */
  provider?: string
  /** set only when the LLM call was served by the local development
   * provider (LLM_DEV_MODE=true) — see llm-providers/types.ts. Threaded
   * through to WorkerExecution so a development run can never be
   * mistaken for a real one, even after LLM_DEV_MODE is turned back off. */
  executionMode?: "development"
  /** Section 9 — partial failure: set true only by a skill that knows
   * at least one of its real external actions genuinely completed AND
   * at least one other genuinely failed/was blocked (e.g. Salesforce
   * succeeded, Slack failed). lib/agent/runtime.ts finalizes such a
   * run as "partially_completed", never silently "completed" (which
   * would hide the real failure) and never "failed" (which would
   * incorrectly imply nothing worked — the Salesforce write must not
   * be re-attempted because the run "failed"). Undefined/false for
   * every normal success. */
  partial?: boolean
}

export interface SkillEvaluation {
  /** 0-100, computed from real structural checks — never Math.random */
  qualityScore: number
  breakdown: { label: string; score: number; note: string }[]
}

export interface MetricEmission {
  key: string
  kind: "operational" | "quality" | "cost" | "business"
  value: number
  unit?: string
}

export interface SkillExecutionContext {
  workerId: string
  executionId: string
  taskId: string
  input: Record<string, string>
  tools: Map<string, ToolDefinition>
  /** real mission/objectives/behaviors/knowledge from the worker being
   * executed — see WorkerContext. A skill is free to ignore fields it
   * doesn't use; nothing here is invented if the worker left it empty. */
  worker: WorkerContext
  emit: (type: RuntimeEventType, payload: Record<string, unknown>) => void
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  category: SkillCategory
  outputType: string
  taskTitle: string
  inputs: SkillInputField[]
  requiredTools: string[]
  instructions: string
  constraints: string[]
  /** the real work. Throws or returns a blocked execution — never fabricates a result. */
  execute: (ctx: SkillExecutionContext) => Promise<SkillExecutionResult>
  evaluate: (result: SkillExecutionResult) => SkillEvaluation
  metrics: (result: SkillExecutionResult, evaluation: SkillEvaluation) => MetricEmission[]
  /** Only implemented by a skill that runs as a named, resumable
   * pipeline (see lib/agent/pipeline/) and threw ApprovalRequiredError
   * with a real resumeState attached. Called by POST /api/approvals/
   * [id]/decide (via lib/agent/runtime.ts's resumeTask()) on Approve:
   * runs the exact approved action for real, then CONTINUES the same
   * pipeline from the next stage — never re-runs a stage this
   * resumeState already recorded as completed. Returns exactly the
   * same SkillExecutionResult shape execute() does, or throws another
   * ApprovalRequiredError if a LATER stage also needs approval. A
   * skill with no resume() falls back to the prior phase's honestly-
   * scoped behavior: Approve runs the one captured action in
   * isolation, no continuation. */
  resume?: (ctx: SkillExecutionContext, resumeState: unknown) => Promise<SkillExecutionResult>
  /** Section 19 — "retry failed step": re-runs exactly one FAILED
   * stage of a resumable pipeline using its own already-completed
   * prior stages, never replaying a real external action that already
   * succeeded. Only implemented by a skill that also implements
   * resume(); `stage` is one of that skill's own real
   * PipelineStageKey values. Called by POST /api/executions/[id]/
   * retry-step via lib/agent/runtime.ts's retryFailedStage(). */
  retryStage?: (ctx: SkillExecutionContext, currentState: unknown, stage: string) => Promise<SkillExecutionResult>
}

/* ---- runtime events — every one must correspond to something real ---- */
export type RuntimeEventType =
  | "task_started"
  | "skill_started"
  | "tool_called"
  | "tool_completed"
  | "tool_blocked"
  | "tool_failed"
  | "reasoning_started"
  | "reasoning_completed"
  | "output_created"
  | "business_event_recorded"
  | "metric_recorded"
  | "task_completed"
  | "task_failed"
  | "task_blocked"
  | "approval_required"
  | "approval_approved"
  | "approval_rejected"
  | "permission_checked"
  | "stage_started"
  | "stage_completed"
  | "stage_failed"
  | "stage_blocked"
  | "stage_skipped"

/** A required credential/tool was never configured. Maps to execution
 * status "blocked" — the NOT_CONFIGURED state. Thrown before any
 * external call is attempted for the missing capability. */
export class SkillBlockedError extends Error {
  readonly code: ExecutionReasonCode = "missing_credential"
  constructor(public reason: string) {
    super(reason)
    this.name = "SkillBlockedError"
  }
}

/** A credential was present but the provider rejected it (401/403).
 * Maps to execution status "failed", reasonCode "invalid_credential". */
export class InvalidCredentialError extends Error {
  readonly code: ExecutionReasonCode = "invalid_credential"
  constructor(message: string) {
    super(message)
    this.name = "InvalidCredentialError"
  }
}

/** The external system was reached but failed (network error, 5xx,
 * timeout) — not a credential problem. Maps to execution status
 * "failed", reasonCode "provider_error". */
export class ProviderError extends Error {
  readonly code: ExecutionReasonCode = "provider_error"
  constructor(message: string) {
    super(message)
    this.name = "ProviderError"
  }
}

/** A tool action's permission (write/publish/delete/financial/
 * external_communication) means it must never auto-execute. Thrown by
 * runToolAction() (lib/agent/tool-runner.ts) BEFORE the action ever
 * runs — no partial side effect, no fabricated result. Maps to
 * execution status "pending_approval", a real terminal state distinct
 * from both "blocked" (missing capability) and "failed" (something
 * went wrong) — this is neither: the capability exists and works, a
 * human just has to say yes first. */
export class ApprovalRequiredError extends Error {
  constructor(
    public toolId: string,
    public toolName: string,
    public actionLabel: string,
    public permission: ToolPermission,
    /** The real action id (e.g. "update_lead") and the real input that
     * would have been sent — captured so a human's later Approve can
     * actually run this exact real call, not a re-guessed one. Never
     * a secret: this is the action's own input shape, the same thing
     * an operator already sees before deciding. */
    public actionId: string,
    public input: unknown,
    /** Set only by a resumable pipeline skill that catches this error
     * locally (see SkillDefinition.resume) and re-throws it with its
     * own real, current PipelineState attached — so Approve can
     * continue the SAME execution past this action instead of only
     * running it in isolation. Undefined for every other skill; never
     * a secret, the same structured state the execution graph UI
     * already shows. */
    public resumeState?: unknown,
    /** Which real pipeline stage this approval blocks, for a
     * resumable skill — lets the runtime fold this into the right
     * PipelineStageRecord (status "waiting_for_approval") without
     * runtime.ts knowing anything skill-specific. */
    public stage?: string,
  ) {
    super(`"${actionLabel}" on ${toolName} requires human approval (${permission}) before it can run.`)
    this.name = "ApprovalRequiredError"
  }
}

/** An action this Worker was explicitly denied — an operator's own
 * Studio Integrations decision (WorkerIntegrationAction.permission ===
 * "deny"), enforced server-side in runToolAction(), never just a
 * hidden button. Maps to execution status "failed", reasonCode
 * "execution_error" — a real, deliberate refusal, not a malfunction. */
export class PermissionDeniedError extends Error {
  readonly code: ExecutionReasonCode = "execution_error"
  constructor(
    public toolId: string,
    public toolName: string,
    public actionLabel: string,
  ) {
    super(`"${actionLabel}" on ${toolName} is denied for this worker — an operator explicitly turned it off in Studio's Integrations step.`)
    this.name = "PermissionDeniedError"
  }
}

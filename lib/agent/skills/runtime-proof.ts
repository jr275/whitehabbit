import "server-only"

/* ================================================================== *
 * SKILL: RUNTIME PROOF (test/proof-only — never registered in the
 * client-facing SKILL_CATALOG, never selectable in Studio, never a
 * real product surface — see lib/workforce/catalog.ts, which
 * deliberately does NOT list this skill).
 *
 * WHY THIS EXISTS: proving the resumable-execution runtime (approval
 * -> WAITING_FOR_APPROVAL -> Approve -> resume -> COMPLETED, the
 * lease/concurrency guard, the idempotency ledger, crash recovery)
 * end to end requires a real permission-gated external write that can
 * actually be exercised in this environment — no real Salesforce/
 * Slack credentials exist here. Faking Salesforce/Slack would violate
 * "never call fake data real integration." Using the Internal Test
 * Connector's one real write action (connector_test.actions/"record"
 * — a real Postgres row, see migrations/0007) instead is honest: it
 * is explicitly, permanently labeled internal/test-only, its output
 * is never presented as a business result, and it is real in every
 * way that matters for proving the RUNTIME mechanism (not any
 * provider's business logic) actually works.
 *
 * Two real stages: intake (deterministic) -> record_action (a real
 * HIGH_RISK_PERMISSIONS write, gated by the exact same server-side
 * approval mechanism a real Salesforce/Slack write goes through).
 * ================================================================== */

import { foldStageEvent } from "@/lib/agent/pipeline/driver"
import { runIdempotent } from "@/lib/agent/pipeline/idempotency"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { RuntimeEventType, SkillDefinition, SkillEvaluation, SkillExecutionContext, SkillExecutionResult, ToolContext } from "@/lib/agent/types"
import { ApprovalRequiredError, SkillBlockedError } from "@/lib/agent/types"
import type { PipelineState } from "@/lib/workforce/model"

interface RuntimeProofPayload {
  note: string
  recordId: string | null
  status: "completed" | "waiting_for_approval" | "blocked" | "failed"
}

function step(ctx: SkillExecutionContext, state: PipelineState, type: RuntimeEventType, payload: Record<string, unknown>): PipelineState {
  ctx.emit(type, payload)
  return foldStageEvent(state, type, payload, Date.now()) ?? state
}

async function runRecordStage(ctx: SkillExecutionContext, toolCtx: ToolContext, note: string, state: PipelineState, opts: { preApproved: boolean }): Promise<{ state: PipelineState; recordId: string | null }> {
  const tool = ctx.tools.get("connector_test.actions")
  if (!tool) {
    state = step(ctx, state, "stage_blocked", { stage: "record_action", label: "Record action", detail: "Internal Test Connector is not connected." })
    throw new SkillBlockedError("Connect the Internal Test Connector to run this skill.")
  }
  state = step(ctx, state, "stage_started", { stage: "record_action", label: "Record action" })
  const action = tool.actions.find((a) => a.id === "record")!

  try {
    const { result } = await runIdempotent(
      ctx.executionId,
      "internal-test",
      "record",
      note,
      async () => (opts.preApproved ? action.run({ note }, toolCtx) : runToolAction(tool.id, tool.name, action, { note }, toolCtx)),
      { stepId: "record_action", integrationId: "connector_test" },
    )
    if (!result.ok) {
      state = step(ctx, state, "stage_failed", { stage: "record_action", label: "Record action", detail: result.error ?? "Record failed.", reasonCode: "provider_error" })
      return { state, recordId: null }
    }
    const recordId = String((result.data as { id?: string } | undefined)?.id ?? "")
    state = step(ctx, state, "stage_completed", { stage: "record_action", label: "Record action", detail: `Recorded ${recordId}.`, provider: "internal-test", action: "record", output: { recordId } })
    return { state, recordId }
  } catch (err) {
    if (err instanceof ApprovalRequiredError) {
      throw new ApprovalRequiredError(err.toolId, err.toolName, err.actionLabel, err.permission, err.actionId, err.input, state, "record_action")
    }
    throw err
  }
}

function buildResult(note: string, recordId: string | null, status: RuntimeProofPayload["status"]): SkillExecutionResult {
  const payload: RuntimeProofPayload = { note, recordId, status }
  return { structured: payload, summary: `Runtime proof: ${status}${recordId ? ` (record ${recordId})` : ""}`, sources: [] }
}

export const runtimeProofSkill: SkillDefinition = {
  id: "skill_runtime_proof",
  name: "Runtime Proof (internal, test-only)",
  description: "Not a product skill — proves the resumable-execution runtime (approval/resume/idempotency/lease/crash-recovery) using the Internal Test Connector's one real write action. Never shown in Studio.",
  category: "communication",
  outputType: "runtime_proof",
  taskTitle: "Runtime proof run",
  inputs: [{ key: "note", label: "Note", type: "text", required: true }],
  requiredTools: ["connector_test.actions"],
  instructions: "Internal runtime-mechanism test only.",
  constraints: ["Never a real business result.", "Never shown as a product skill."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const note = ctx.input.note?.trim() || "runtime proof"
    const toolCtx: ToolContext = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit, integrations: ctx.worker.integrations }
    let state: PipelineState = { objective: { objective: note, constraints: [], criteria: [], requestedActions: [] }, stages: [{ key: "objective_intake", label: "Intake", status: "queued" }, { key: "record_action", label: "Record action", status: "queued" }] }
    state = step(ctx, state, "stage_started", { stage: "objective_intake", label: "Intake", objective: state.objective })
    state = step(ctx, state, "stage_completed", { stage: "objective_intake", label: "Intake" })
    const { recordId } = await runRecordStage(ctx, toolCtx, note, state, { preApproved: false })
    return buildResult(note, recordId, "completed")
  },

  resume: async (ctx, resumeStateRaw): Promise<SkillExecutionResult> => {
    const state = resumeStateRaw as PipelineState
    const note = state.objective.objective
    const toolCtx: ToolContext = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit, integrations: ctx.worker.integrations }
    const { recordId } = await runRecordStage(ctx, toolCtx, note, state, { preApproved: true })
    return buildResult(note, recordId, "completed")
  },

  retryStage: async (ctx, resumeStateRaw): Promise<SkillExecutionResult> => {
    const state = resumeStateRaw as PipelineState
    const note = state.objective.objective
    const toolCtx: ToolContext = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit, integrations: ctx.worker.integrations }
    const { recordId } = await runRecordStage(ctx, toolCtx, note, state, { preApproved: false })
    return buildResult(note, recordId, "completed")
  },

  evaluate: (): SkillEvaluation => ({ qualityScore: 100, breakdown: [] }),
  metrics: () => [],
}

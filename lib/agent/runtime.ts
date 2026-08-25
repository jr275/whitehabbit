import "server-only"

/* ================================================================== *
 * AGENT RUNTIME — Worker -> Trigger -> Task -> Planner -> Skill ->
 * Tool -> External System -> Observation -> Output -> Business Event
 * -> Metric -> Outcome.
 *
 * execute() is an async generator: it yields each real WorkerEvent the
 * instant it happens (via an internal queue bridging the skill's
 * synchronous ctx.emit callback to this generator) and persists every
 * task/execution/event/output/metric row as it goes — so even if the
 * HTTP client disconnects mid-run, the database already has the truth.
 *
 * This module is the ONLY thing that knows execution is "local
 * function calls today". The API route that calls execute() just
 * consumes an async iterator of events — swapping this for a queue
 * worker, Temporal, or a remote agent runtime later means replacing
 * this one file's internals, not any caller.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { llmCostUsd } from "@/lib/agent/cost"
import { foldStageEvent, isStageEvent, skipDownstreamStages } from "@/lib/agent/pipeline/driver"
import { getSkill } from "@/lib/agent/skills/registry"
import { toolsMapForOrg } from "@/lib/agent/tools/connector-tools"
import type { ExecutionReasonCode, RuntimeEventType, SkillDefinition, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { ApprovalRequiredError, InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"
import * as repo from "@/lib/db/repo"
import { deriveBusinessEvents } from "@/lib/workforce/business-events"
import type {
  Approval,
  BusinessEvent,
  MetricRecord,
  PipelineState,
  Worker,
  WorkerEvent,
  WorkerEventType,
  WorkerExecution,
  WorkerOutput,
  WorkerTask,
} from "@/lib/workforce/model"

class EventQueue {
  private buffered: WorkerEvent[] = []
  private waiting: ((e: WorkerEvent | null) => void)[] = []
  private closed = false

  push(e: WorkerEvent) {
    const waiter = this.waiting.shift()
    if (waiter) waiter(e)
    else this.buffered.push(e)
  }

  close() {
    this.closed = true
    for (const w of this.waiting.splice(0)) w(null)
  }

  next(): Promise<WorkerEvent | null> {
    if (this.buffered.length) return Promise.resolve(this.buffered.shift()!)
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => this.waiting.push(resolve))
  }
}

/** `ctx.emit()` is a synchronous callback (skills call it fire-and-
 * forget, mid-execution) but every event must become a real, durably
 * persisted Postgres row. This chains each write onto the previous
 * one's promise, so writes for one execution always land in the exact
 * order emitted — required for `sequence` to mean anything — without
 * requiring every skill file to become async at the call site. */
class SerialWriter {
  private pending: Promise<unknown> = Promise.resolve()

  enqueue(fn: () => Promise<unknown>) {
    this.pending = this.pending.then(fn, fn)
  }

  async drain(): Promise<void> {
    await this.pending
  }
}

/** Builds the one real `emit()` every execution (fresh or resumed)
 * uses: persists every event durably and in order (via SerialWriter),
 * pushes it to the live stream queue, AND — generically, for any
 * skill, never provider- or skill-specific — folds stage_* events
 * into a persisted PipelineState (lib/agent/pipeline/driver.ts). A
 * skill that never emits a stage_* event never gets a pipeline_state
 * at all; this is purely additive over the existing event log. */
function makeEmitter(execution: WorkerExecution, task: WorkerTask, orgId: string, queue: EventQueue, writer: SerialWriter, seedState?: PipelineState) {
  let pipelineState = seedState
  const emit = (type: RuntimeEventType, payload: Record<string, unknown>) => {
    const now = Date.now()
    const event: WorkerEvent = {
      id: `ev_${randomUUID()}`,
      workerId: execution.workerId,
      executionId: execution.id,
      taskId: task.id,
      type: type as WorkerEventType,
      timestamp: now,
      payload,
    }
    writer.enqueue(() => repo.insertExecutionEvent(event, orgId))
    if (isStageEvent(type as RuntimeEventType)) {
      const next = foldStageEvent(pipelineState, type as RuntimeEventType, payload, now)
      if (next) {
        pipelineState = next
        writer.enqueue(() => repo.updatePipelineState(execution.id, orgId, next))
      }
    }
    queue.push(event)
  }
  return { emit, getPipelineState: () => pipelineState }
}

export interface RunTaskInput {
  worker: Worker
  orgId: string
  /** The exact immutable WorkerVersion this run executes — Run Worker
   * always resolves this to the worker's released version; Test
   * resolves it to the version Build just produced from the draft.
   * Never the live-editable draft itself. */
  workerVersionId: string
  skillId: string
  input: Record<string, string>
}

/**
 * Runs one real task against the worker's real tools and streams every
 * event as it actually happens. Fully persists the task/execution and,
 * on success, the output and its metrics; on blocked/failed, persists
 * the real reason instead.
 */
export async function* executeTask(run: RunTaskInput): AsyncGenerator<WorkerEvent, void, void> {
  const skill = getSkill(run.skillId)
  if (!skill) throw new Error(`Unknown skill: ${run.skillId}`)

  const now = Date.now()
  const task: WorkerTask = {
    id: `task_${randomUUID()}`,
    workerId: run.worker.id,
    skillId: skill.id,
    type: skill.category,
    title: skill.taskTitle,
    status: "running",
    createdAt: now,
  }
  const execution: WorkerExecution = {
    id: `exec_${randomUUID()}`,
    workerId: run.worker.id,
    workerVersionId: run.workerVersionId,
    taskId: task.id,
    status: "running",
    startedAt: now,
    completedAt: null,
  }
  // These two must be durable before we emit anything — a reconnecting
  // client's first read is "does this execution exist at all".
  await repo.insertTask(task, run.orgId, run.input)
  await repo.insertExecution(execution, run.orgId)

  const queue = new EventQueue()
  const writer = new SerialWriter()
  const { emit } = makeEmitter(execution, task, run.orgId, queue, writer)

  const driver = (async () => {
    emit("task_started", { skillId: skill.id, skillName: skill.name, input: run.input })
    emit("skill_started", { skillId: skill.id })

    try {
      const workerContext: WorkerContext = {
        mission: run.worker.mission,
        objectives: run.worker.objectives.filter((o) => !o.done).map((o) => o.text),
        behaviors: run.worker.behaviors.map((b) => ({ condition: b.condition, action: b.action })),
        knowledge: run.worker.knowledge.map((k) => ({ id: k.id, name: k.name, type: k.type, content: k.content })),
        integrations: run.worker.integrations,
      }
      // The Integration Runtime merge point (lib/agent/tools/connector-
      // tools.ts) — a real, CONNECTED Connector's real ToolDefinitions,
      // merged alongside the native tools every skill already had
      // access to. This is the one place a Connector Tool actually
      // becomes reachable by a real execution; skill.execute() below
      // never knows or cares whether a tool it calls is native or came
      // from a Connector — it only ever sees ToolDefinition, exactly
      // the "Agent Runtime must never know a provider by name" contract.
      const tools = await toolsMapForOrg(run.orgId)
      const result: SkillExecutionResult = await skill.execute({
        workerId: run.worker.id,
        executionId: execution.id,
        taskId: task.id,
        input: run.input,
        tools,
        worker: workerContext,
        emit,
      })

      await finishSuccessfulRun({ orgId: run.orgId, workerId: run.worker.id, productId: run.worker.productId, execution, task, skill, result, input: run.input, emit })
    } catch (err) {
      await handleRunFailure(run.orgId, run.worker.id, execution, task, emit, err, skill.id)
    } finally {
      // every emitted event must be durably written before this
      // execution is considered finished — a reconnecting client reads
      // Postgres, not this in-memory generator.
      await writer.drain()
      queue.close()
    }
  })()

  while (true) {
    const event = await queue.next()
    if (event === null) break
    yield event
  }
  await driver
}

/** The real success tail, shared by a fresh run and a resumed run:
 * persist the output, derive+persist real Business Events, persist
 * real metrics, finalize the execution as "completed", and (for a
 * Product-provisioned Worker) append a real memory note. Identical
 * behavior either way — a resumed pipeline's final result is exactly
 * as real and exactly as fully persisted as a same-run completion. */
async function finishSuccessfulRun(args: {
  orgId: string
  workerId: string
  productId?: string
  execution: WorkerExecution
  task: WorkerTask
  skill: Pick<SkillDefinition, "id" | "name" | "outputType" | "evaluate" | "metrics">
  result: SkillExecutionResult
  input: Record<string, string>
  emit: (type: RuntimeEventType, payload: Record<string, unknown>) => void
}): Promise<void> {
  const { orgId, workerId, productId, execution, task, skill, result, input, emit } = args
  const evaluation = skill.evaluate(result)
  const output: WorkerOutput = {
    id: `out_${randomUUID()}`,
    workerId,
    taskId: task.id,
    executionId: execution.id,
    type: skill.outputType,
    title: titleFor(skill.outputType, input),
    content: result.summary,
    structured: result.structured,
    sources: result.sources,
    qualityScore: evaluation.qualityScore,
    evaluation,
    status: "completed",
    createdAt: Date.now(),
  }
  await repo.insertOutput(output, orgId)
  emit("output_created", { outputId: output.id, title: output.title, qualityScore: evaluation.qualityScore })

  // Business Event layer: derive real, persistable events from the
  // output's own structured result (never invented) and record them
  // before metrics, so each metric can carry the id of the business
  // event it's evidence for (metrics.business_event_id).
  const businessEventIdByMetricKey = new Map<string, string>()
  for (const derived of deriveBusinessEvents(output)) {
    const businessEvent: BusinessEvent = {
      id: `be_${randomUUID()}`,
      workerId,
      outputId: output.id,
      executionId: execution.id,
      type: derived.type,
      entityId: derived.entityId,
      entityType: derived.entityType,
      numericValue: derived.numericValue,
      confidence: derived.confidence,
      source: derived.source,
      payload: derived.payload,
      occurredAt: Date.now(),
    }
    await repo.insertBusinessEvent(businessEvent, orgId)
    emit("business_event_recorded", { type: businessEvent.type, entityType: businessEvent.entityType, numericValue: businessEvent.numericValue })
    for (const key of derived.relatedMetricKeys) businessEventIdByMetricKey.set(key, businessEvent.id)
  }

  const emissions = skill.metrics(result, evaluation)
  const metricRecords: MetricRecord[] = emissions.map((m) => ({
    id: `met_${randomUUID()}`,
    workerId,
    executionId: execution.id,
    businessEventId: businessEventIdByMetricKey.get(m.key),
    key: m.key,
    kind: m.kind,
    value: m.value,
    unit: m.unit,
    recordedAt: Date.now(),
  }))
  for (const m of metricRecords) {
    await repo.insertMetric(m, orgId)
    emit("metric_recorded", { key: m.key, kind: m.kind, value: m.value, unit: m.unit })
  }

  const completedAt = Date.now()
  const durationMs = completedAt - execution.startedAt
  await repo.finalizeExecution(execution.id, {
    status: "completed",
    completedAt,
    durationMs,
    costUsd: sumCost(result),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
    executionMode: result.executionMode,
  })
  await repo.updateTaskStatus(task.id, "completed")
  emit("task_completed", { outputId: output.id, durationMs })

  // Domain Intelligence -> Memory: only for a Product-provisioned
  // Worker (see lib/workforce/seed.ts's buildWorkerFromProduct()),
  // and only a real, already-computed fact — never invented here,
  // never blocking the execution it's derived from.
  if (productId) {
    const note = `${new Date(completedAt).toISOString().slice(0, 10)} — ${skill.name}: quality ${evaluation.qualityScore}%, ${result.sources.length} source${result.sources.length === 1 ? "" : "s"}.`
    repo.appendWorkerMemory(workerId, orgId, note).catch((memErr) => {
      console.error("[runtime] appendWorkerMemory failed (non-fatal)", memErr)
    })
  }
}

/** The real failure/blocked/approval-required tail, shared by a fresh
 * run and a resumed run — structured, distinguishable failure, never
 * a swallowed generic error. `reasonCode` is what the UI branches on
 * to decide between "credential required" vs "the provider failed"
 * vs "this run's own logic broke" — never inferred from string-
 * matching a message. */
async function handleRunFailure(orgId: string, workerId: string, execution: WorkerExecution, task: WorkerTask, emit: (type: RuntimeEventType, payload: Record<string, unknown>) => void, err: unknown, skillId: string): Promise<void> {
  const completedAt = Date.now()
  const durationMs = completedAt - execution.startedAt
  if (err instanceof SkillBlockedError) {
    await repo.finalizeExecution(execution.id, { status: "blocked", reasonCode: err.code, blockedReason: err.reason, completedAt, durationMs })
    await repo.updateTaskStatus(task.id, "blocked")
    emit("task_blocked", { reason: err.reason, reasonCode: err.code })
  } else if (err instanceof ApprovalRequiredError) {
    // Real terminal state, not a failure: the tool exists and works,
    // it just requires a human to say yes first. No tool action ran —
    // runToolAction() throws before calling it. `resumeState`/`stage`
    // are set only by a resumable pipeline skill (lib/agent/pipeline/)
    // that caught this error and re-threw it with its own current
    // state attached — undefined for every other skill, which keeps
    // the prior phase's "Approve runs the one captured action in
    // isolation" behavior exactly as it was.
    await repo.finalizeExecution(execution.id, { status: "pending_approval", blockedReason: err.message, completedAt, durationMs })
    await repo.updateTaskStatus(task.id, "pending_approval")
    await repo.createApproval({
      orgId,
      workerId,
      executionId: execution.id,
      toolId: err.toolId,
      toolName: err.toolName,
      actionId: err.actionId,
      actionLabel: err.actionLabel,
      permission: err.permission,
      reason: err.message,
      input: err.input,
      skillId,
      resumeState: err.resumeState,
    })
    emit("approval_required", { reason: err.message, toolId: err.toolId, toolName: err.toolName, action: err.actionLabel, permission: err.permission, stage: err.stage })
  } else {
    const reasonCode: ExecutionReasonCode = err instanceof InvalidCredentialError || err instanceof ProviderError ? err.code : "execution_error"
    const message = err instanceof Error ? err.message : "Task failed for an unknown reason."
    await repo.finalizeExecution(execution.id, { status: "failed", reasonCode, blockedReason: message, completedAt, durationMs })
    await repo.updateTaskStatus(task.id, "failed")
    emit("task_failed", { reason: message, reasonCode })
  }
}

/**
 * Resumes a pipeline skill's execution after a human Approve decision
 * — the real continuation this architecture can honestly provide (see
 * Approval.resumeState's doc comment): the SAME execution row is
 * reopened, the approved action runs for real, and — only if the
 * skill implements resume() — the pipeline continues past it (e.g.
 * reaching the Slack step after a Salesforce update is approved)
 * instead of stopping at the one approved action. A skill with no
 * resume() is handled entirely by the caller (POST /api/approvals/
 * [id]/decide) exactly as the prior phase did — this function is only
 * called when approval.resumeState and a matching skill.resume() both
 * exist.
 */
export async function resumeTask(approval: Approval, orgId: string): Promise<{ execution: WorkerExecution } | null> {
  if (!approval.executionId || !approval.skillId || approval.resumeState == null) return null
  const skill = getSkill(approval.skillId)
  if (!skill?.resume) return null

  const execution = await repo.getExecution(approval.executionId, orgId)
  if (!execution) return null
  const worker = await repo.getWorker(approval.workerId, orgId)
  if (!worker) return null
  const task: WorkerTask = { id: execution.taskId, workerId: worker.id, skillId: skill.id, type: skill.category, title: skill.taskTitle, status: "running", createdAt: execution.startedAt }

  await repo.updateExecutionStatus(execution.id, "running")
  await repo.updateTaskStatus(task.id, "running")

  const queue = new EventQueue()
  const writer = new SerialWriter()
  const { emit } = makeEmitter(execution, task, orgId, queue, writer, approval.resumeState as PipelineState)
  emit("approval_approved", { toolId: approval.toolId, toolName: approval.toolName, action: approval.actionLabel })

  const workerContext: WorkerContext = {
    mission: worker.mission,
    objectives: worker.objectives.filter((o) => !o.done).map((o) => o.text),
    behaviors: worker.behaviors.map((b) => ({ condition: b.condition, action: b.action })),
    knowledge: worker.knowledge.map((k) => ({ id: k.id, name: k.name, type: k.type, content: k.content })),
    integrations: worker.integrations,
  }
  const tools = await toolsMapForOrg(orgId)

  const driver = (async () => {
    try {
      const result = await skill.resume!({ workerId: worker.id, executionId: execution.id, taskId: task.id, input: {}, tools, worker: workerContext, emit }, approval.resumeState)
      await finishSuccessfulRun({ orgId, workerId: worker.id, productId: worker.productId, execution, task, skill, result, input: {}, emit })
    } catch (err) {
      await handleRunFailure(orgId, worker.id, execution, task, emit, err, skill.id)
    } finally {
      await writer.drain()
      queue.close()
    }
  })()

  // Drain the stream (nothing external is listening on resume — this
  // is a plain POST, not the streaming /run endpoint — but the same
  // real persistence must complete before this call returns).
  while ((await queue.next()) !== null) {
    /* drained for its persistence side effects only */
  }
  await driver

  return { execution: (await repo.getExecution(execution.id, orgId))! }
}

function titleFor(outputType: string, input: Record<string, string>): string {
  const query = input.query?.trim()
  switch (outputType) {
    case "trend_report":
      return query ? `Trend report — ${query}` : "Trend report"
    case "content_analysis":
      return "Content performance analysis"
    case "engagement_analysis":
      return "Engagement analysis"
    default:
      return "Result"
  }
}

/** The single authoritative cost calculation: real tokens x the active
 * provider's real (or explicitly configured) rate. Returns undefined —
 * not 0 — when no rate is configured for that provider, so the UI can
 * tell "unmeasured" apart from "genuinely free".
 *
 * A development-mode result is the one deliberate exception: it never
 * consumed real tokens, so there is no rate to look up and nothing to
 * mark "unmeasured" — the cost is a real, definite $0, not an unknown. */
function sumCost(result: SkillExecutionResult): number | undefined {
  if (result.executionMode === "development") return 0
  if (result.inputTokens == null || !result.provider) return undefined
  const estimate = llmCostUsd(result.provider, result.inputTokens, result.outputTokens ?? 0)
  return estimate.costUsd ?? undefined
}

/**
 * Section 19 — "retry failed step": re-runs exactly one FAILED stage
 * of a resumable pipeline's SAME execution, using its own already-
 * completed prior stages (never re-researching, never re-scoring,
 * never replaying a real external action that already succeeded).
 * Only works for a skill that implements retryStage() and an
 * execution whose pipeline_state actually has that stage in "failed".
 */
export async function retryFailedStage(executionId: string, orgId: string, stage: string): Promise<{ execution: WorkerExecution } | { error: string }> {
  const execution = await repo.getExecution(executionId, orgId)
  if (!execution) return { error: "Execution not found." }
  if (!execution.pipelineState) return { error: "This execution has no retryable pipeline state." }
  const target = execution.pipelineState.stages.find((s) => s.key === stage)
  if (!target || target.status !== "failed") return { error: `Stage "${stage}" is not in a failed state.` }

  const task = await repo.getTask(execution.taskId, orgId)
  if (!task) return { error: "The originating task could not be found." }
  const skill = getSkill(task.skillId)
  if (!skill?.retryStage) return { error: "This skill does not support retrying a failed step." }

  const worker = await repo.getWorker(execution.workerId, orgId)
  if (!worker) return { error: "Worker not found." }

  await repo.updateExecutionStatus(execution.id, "running")
  await repo.updateTaskStatus(task.id, "running")

  const queue = new EventQueue()
  const writer = new SerialWriter()
  const { emit } = makeEmitter(execution, task, orgId, queue, writer, execution.pipelineState)

  const workerContext: WorkerContext = {
    mission: worker.mission,
    objectives: worker.objectives.filter((o) => !o.done).map((o) => o.text),
    behaviors: worker.behaviors.map((b) => ({ condition: b.condition, action: b.action })),
    knowledge: worker.knowledge.map((k) => ({ id: k.id, name: k.name, type: k.type, content: k.content })),
    integrations: worker.integrations,
  }
  const tools = await toolsMapForOrg(orgId)

  const driver = (async () => {
    try {
      const result = await skill.retryStage!({ workerId: worker.id, executionId: execution.id, taskId: task.id, input: {}, tools, worker: workerContext, emit }, execution.pipelineState, stage)
      await finishSuccessfulRun({ orgId, workerId: worker.id, productId: worker.productId, execution, task, skill, result, input: {}, emit })
    } catch (err) {
      await handleRunFailure(orgId, worker.id, execution, task, emit, err, skill.id)
    } finally {
      await writer.drain()
      queue.close()
    }
  })()

  while ((await queue.next()) !== null) {
    /* drained for its persistence side effects only */
  }
  await driver

  return { execution: (await repo.getExecution(execution.id, orgId))! }
}

/**
 * The real REJECT tail for a resumable pipeline's approval (section
 * 8: "On REJECT: mark the action rejected and continue or terminate
 * according to policy"). The policy here is real and explainable: a
 * rejected action's own stage is marked "rejected"; every stage still
 * queued downstream of it (e.g. Slack, which only ever runs after a
 * successful CRM action) is marked "skipped" — never attempted, never
 * fabricated as having run — and the SAME execution is finalized as
 * "cancelled": a human declined it, which is not a system failure.
 */
export async function finalizeRejectedExecution(approval: Approval, orgId: string): Promise<WorkerExecution | null> {
  if (!approval.executionId) return null
  const execution = await repo.getExecution(approval.executionId, orgId)
  if (!execution) return null

  const task: WorkerTask = { id: execution.taskId, workerId: execution.workerId, skillId: approval.skillId ?? "", type: "sales", title: approval.actionLabel, status: "running", createdAt: execution.startedAt }
  const queue = new EventQueue()
  const writer = new SerialWriter()
  const { emit, getPipelineState } = makeEmitter(execution, task, orgId, queue, writer, approval.resumeState as PipelineState | undefined)

  emit("approval_rejected", { toolId: approval.toolId, toolName: approval.toolName, action: approval.actionLabel, stage: (approval.resumeState as PipelineState | undefined)?.stages.find((s) => s.status === "waiting_for_approval")?.key })

  const state = getPipelineState()
  if (state) {
    const rejectedStage = state.stages.find((s) => s.status === "rejected")
    const next = rejectedStage ? skipDownstreamStages(state, rejectedStage.key) : state
    await repo.updatePipelineState(execution.id, orgId, next)
  }

  const completedAt = Date.now()
  await repo.finalizeExecution(execution.id, { status: "cancelled", blockedReason: `Rejected by operator: "${approval.actionLabel}" on ${approval.toolName}.`, completedAt, durationMs: completedAt - execution.startedAt })
  await repo.updateTaskStatus(task.id, "failed")

  await writer.drain()
  queue.close()
  return repo.getExecution(execution.id, orgId)
}

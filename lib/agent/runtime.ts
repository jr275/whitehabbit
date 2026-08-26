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
import { getSkill } from "@/lib/agent/skills/registry"
import { toolsMap } from "@/lib/agent/tools/registry"
import type { ExecutionReasonCode, RuntimeEventType, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { ApprovalRequiredError, InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"
import * as repo from "@/lib/db/repo"
import { ingestSeoOpportunityPlan } from "@/lib/opportunity/ingest"
import type {
  MetricRecord,
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

  const emit = (type: RuntimeEventType, payload: Record<string, unknown>) => {
    const event: WorkerEvent = {
      id: `ev_${randomUUID()}`,
      workerId: run.worker.id,
      executionId: execution.id,
      taskId: task.id,
      type: type as WorkerEventType,
      timestamp: Date.now(),
      payload,
    }
    writer.enqueue(() => repo.insertExecutionEvent(event, run.orgId))
    queue.push(event)
  }

  const driver = (async () => {
    emit("task_started", { skillId: skill.id, skillName: skill.name, input: run.input })
    emit("skill_started", { skillId: skill.id })

    try {
      const workerContext: WorkerContext = {
        mission: run.worker.mission,
        objectives: run.worker.objectives.filter((o) => !o.done).map((o) => o.text),
        behaviors: run.worker.behaviors.map((b) => ({ condition: b.condition, action: b.action })),
        knowledge: run.worker.knowledge.map((k) => ({ id: k.id, name: k.name, type: k.type, content: k.content })),
      }
      const result: SkillExecutionResult = await skill.execute({
        workerId: run.worker.id,
        executionId: execution.id,
        taskId: task.id,
        input: run.input,
        tools: toolsMap(),
        worker: workerContext,
        emit,
      })

      const evaluation = skill.evaluate(result)
      const output: WorkerOutput = {
        id: `out_${randomUUID()}`,
        workerId: run.worker.id,
        taskId: task.id,
        executionId: execution.id,
        type: skill.outputType,
        title: titleFor(skill.outputType, run.input),
        content: result.summary,
        structured: result.structured,
        sources: result.sources,
        qualityScore: evaluation.qualityScore,
        evaluation,
        status: "completed",
        createdAt: Date.now(),
      }
      await repo.insertOutput(output, run.orgId)
      emit("output_created", { outputId: output.id, title: output.title, qualityScore: evaluation.qualityScore })

      // Knowledge Graph / Opportunity Engine ingestion (docs/adr/ADR-006,
      // ADR-014): real for skill_seo_opportunity output only today.
      // Fire-and-forget-but-awaited, non-fatal — a failure here must
      // never fail the execution it's derived from, mirroring the
      // appendWorkerMemory() pattern below.
      if (skill.outputType === "seo_opportunity_plan") {
        try {
          await ingestSeoOpportunityPlan({
            orgId: run.orgId,
            executionId: execution.id,
            outputId: output.id,
            structured: result.structured,
            evaluation,
          })
        } catch (ingestErr) {
          console.error("[runtime] ingestSeoOpportunityPlan failed (non-fatal)", ingestErr)
        }
      }

      const emissions = skill.metrics(result, evaluation)
      const metricRecords: MetricRecord[] = emissions.map((m) => ({
        id: `met_${randomUUID()}`,
        workerId: run.worker.id,
        executionId: execution.id,
        key: m.key,
        kind: m.kind,
        value: m.value,
        unit: m.unit,
        recordedAt: Date.now(),
      }))
      for (const m of metricRecords) {
        await repo.insertMetric(m, run.orgId)
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
      if (run.worker.productId) {
        const note = `${new Date(completedAt).toISOString().slice(0, 10)} — ${skill.name}: quality ${evaluation.qualityScore}%, ${result.sources.length} source${result.sources.length === 1 ? "" : "s"}.`
        repo.appendWorkerMemory(run.worker.id, run.orgId, note).catch((memErr) => {
          console.error("[runtime] appendWorkerMemory failed (non-fatal)", memErr)
        })
      }
    } catch (err) {
      const completedAt = Date.now()
      const durationMs = completedAt - execution.startedAt
      // structured, distinguishable failure — never a swallowed generic
      // error. `reasonCode` is what the UI branches on to decide between
      // "credential required" vs "the provider failed" vs "this run's
      // own logic broke" — never inferred from string-matching a message.
      if (err instanceof SkillBlockedError) {
        await repo.finalizeExecution(execution.id, { status: "blocked", reasonCode: err.code, blockedReason: err.reason, completedAt, durationMs })
        await repo.updateTaskStatus(task.id, "blocked")
        emit("task_blocked", { reason: err.reason, reasonCode: err.code })
      } else if (err instanceof ApprovalRequiredError) {
        // Real terminal state, not a failure: the tool exists and
        // works, it just requires a human to say yes first. No tool
        // action ran — runToolAction() throws before calling it.
        await repo.finalizeExecution(execution.id, { status: "pending_approval", blockedReason: err.message, completedAt, durationMs })
        await repo.updateTaskStatus(task.id, "pending_approval")
        emit("approval_required", { reason: err.message, toolId: err.toolId, toolName: err.toolName, action: err.actionLabel, permission: err.permission })
      } else {
        const reasonCode: ExecutionReasonCode = err instanceof InvalidCredentialError || err instanceof ProviderError ? err.code : "execution_error"
        const message = err instanceof Error ? err.message : "Task failed for an unknown reason."
        await repo.finalizeExecution(execution.id, { status: "failed", reasonCode, blockedReason: message, completedAt, durationMs })
        await repo.updateTaskStatus(task.id, "failed")
        emit("task_failed", { reason: message, reasonCode })
      }
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

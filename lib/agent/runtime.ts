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
import type { ExecutionReasonCode, RuntimeEventType, SkillExecutionResult } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"
import * as repo from "@/lib/db/repo"
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

export interface RunTaskInput {
  worker: Worker
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
    taskId: task.id,
    status: "running",
    startedAt: now,
    completedAt: null,
  }
  repo.insertTask(task, run.input)
  repo.insertExecution(execution)

  const queue = new EventQueue()

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
    repo.insertEvent(event)
    queue.push(event)
  }

  const driver = (async () => {
    emit("task_started", { skillId: skill.id, skillName: skill.name, input: run.input })
    emit("skill_started", { skillId: skill.id })

    try {
      const result: SkillExecutionResult = await skill.execute({
        workerId: run.worker.id,
        executionId: execution.id,
        taskId: task.id,
        input: run.input,
        tools: toolsMap(),
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
      repo.insertOutput(output)
      emit("output_created", { outputId: output.id, title: output.title, qualityScore: evaluation.qualityScore })

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
        repo.insertMetric(m)
        emit("metric_recorded", { key: m.key, kind: m.kind, value: m.value, unit: m.unit })
      }

      const completedAt = Date.now()
      const durationMs = completedAt - execution.startedAt
      repo.finalizeExecution(execution.id, {
        status: "completed",
        completedAt,
        durationMs,
        costUsd: sumCost(result),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
      })
      repo.updateTaskStatus(task.id, "completed")
      emit("task_completed", { outputId: output.id, durationMs })
    } catch (err) {
      const completedAt = Date.now()
      const durationMs = completedAt - execution.startedAt
      // structured, distinguishable failure — never a swallowed generic
      // error. `reasonCode` is what the UI branches on to decide between
      // "credential required" vs "the provider failed" vs "this run's
      // own logic broke" — never inferred from string-matching a message.
      if (err instanceof SkillBlockedError) {
        repo.finalizeExecution(execution.id, { status: "blocked", reasonCode: err.code, blockedReason: err.reason, completedAt, durationMs })
        repo.updateTaskStatus(task.id, "blocked")
        emit("task_blocked", { reason: err.reason, reasonCode: err.code })
      } else {
        const reasonCode: ExecutionReasonCode = err instanceof InvalidCredentialError || err instanceof ProviderError ? err.code : "execution_error"
        const message = err instanceof Error ? err.message : "Task failed for an unknown reason."
        repo.finalizeExecution(execution.id, { status: "failed", reasonCode, blockedReason: message, completedAt, durationMs })
        repo.updateTaskStatus(task.id, "failed")
        emit("task_failed", { reason: message, reasonCode })
      }
    } finally {
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
 * tell "unmeasured" apart from "genuinely free". */
function sumCost(result: SkillExecutionResult): number | undefined {
  if (result.inputTokens == null || !result.provider) return undefined
  const estimate = llmCostUsd(result.provider, result.inputTokens, result.outputTokens ?? 0)
  return estimate.costUsd ?? undefined
}

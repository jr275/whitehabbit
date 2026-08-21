/* ================================================================== *
 * EXECUTION ENGINE — turns "Run Worker" into a real event stream.
 *
 * Every enabled skill becomes a parallel work stream: a WorkerTask, a
 * WorkerExecution, and — as each unit of work completes — a concrete
 * WorkerOutput. Timing lives HERE, never faked inside a component. This
 * is a WorkerEvent source; swapping it for SSE/WebSockets/a real agent
 * backend later requires no UI change, only a new emitter.
 * ================================================================== */

import { SKILL_CATALOG } from "./catalog"
import { generateOutput } from "./content"
import type { Skill, Worker, WorkerEvent, WorkerExecution, WorkerOutput, WorkerTask } from "./model"

let seq = 0
function uid(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
}

export interface RunHandle {
  cancel: () => void
}

export interface RunPlanItem {
  task: WorkerTask
  execution: WorkerExecution
  skill: Skill
  target: number
}

const TICK_MS = 420

/** How many units this skill will complete in one Run Worker click. */
function batchSize(seedN: number): number {
  return 4 + (seedN % 6) // 4..9
}

/**
 * Kick off a run across every enabled skill on the worker. `emit` receives
 * every WorkerEvent as it happens; the caller (the store) materializes
 * Task/Execution/Output records from the stream.
 */
export function runWorker(worker: Worker, emit: (e: WorkerEvent) => void): RunHandle {
  const activeSkills = worker.skills.filter((s) => s.enabled)
  if (activeSkills.length === 0) return { cancel: () => {} }

  const now = Date.now()
  const streams: RunPlanItem[] = activeSkills.map((skill, i) => {
    const template = SKILL_CATALOG.find((t) => t.id === skill.id)
    const target = batchSize(now + i * 7)
    const task: WorkerTask = {
      id: uid("task"),
      workerId: worker.id,
      skillId: skill.id,
      type: skill.category,
      title: template?.taskTitle ?? skill.name,
      status: "running",
      createdAt: now,
    }
    const execution: WorkerExecution = {
      id: uid("exec"),
      workerId: worker.id,
      taskId: task.id,
      status: "running",
      progress: 0,
      target,
      done: 0,
      label: template?.taskTitle ?? skill.name,
      startedAt: now,
      completedAt: null,
    }
    return { task, execution, skill, target }
  })

  // announce every task/execution starting
  for (const s of streams) {
    emit({
      id: uid("ev"),
      workerId: worker.id,
      executionId: s.execution.id,
      taskId: s.task.id,
      type: "task_started",
      timestamp: Date.now(),
      payload: { task: s.task, execution: s.execution },
    })
  }

  let cancelled = false
  const remaining = new Set(streams.map((s) => s.execution.id))

  const timer = setInterval(() => {
    if (cancelled) return
    let outputIndex = 0
    for (const s of streams) {
      if (!remaining.has(s.execution.id)) continue
      const done = Math.min(s.target, streamDone(s.execution.id) + 1)
      setStreamDone(s.execution.id, done)
      outputIndex += 1

      const generated = generateOutput(s.skill.produces, worker, hashSeed(s.execution.id, done))
      const output: WorkerOutput = {
        id: uid("out"),
        workerId: worker.id,
        taskId: s.task.id,
        executionId: s.execution.id,
        type: s.skill.produces,
        title: generated.title,
        content: generated.content,
        channel: generated.channel,
        status: generated.status,
        qualityScore: generated.qualityScore,
        confidenceScore: generated.confidenceScore,
        taskSuccess: generated.taskSuccess,
        policyCompliance: generated.policyCompliance,
        brandAdherence: generated.brandAdherence,
        factuality: generated.factuality,
        input: generated.input,
        toolsUsed: generated.toolsUsed,
        knowledgeUsed: generated.knowledgeUsed,
        policyChecks: generated.policyChecks,
        approval: generated.approval,
        durationMs: generated.durationMs,
        model: generated.model,
        createdAt: Date.now(),
      }

      emit({
        id: uid("ev"),
        workerId: worker.id,
        executionId: s.execution.id,
        taskId: s.task.id,
        type: "progress",
        timestamp: Date.now(),
        payload: { done, target: s.target, label: s.execution.label },
      })
      emit({
        id: uid("ev"),
        workerId: worker.id,
        executionId: s.execution.id,
        taskId: s.task.id,
        type: "output_created",
        timestamp: Date.now(),
        payload: { output },
      })

      if (done >= s.target) {
        remaining.delete(s.execution.id)
        emit({
          id: uid("ev"),
          workerId: worker.id,
          executionId: s.execution.id,
          taskId: s.task.id,
          type: "task_completed",
          timestamp: Date.now(),
          payload: {},
        })
      }
    }

    if (remaining.size === 0) {
      clearInterval(timer)
    }
  }, TICK_MS)

  return {
    cancel: () => {
      cancelled = true
      clearInterval(timer)
    },
  }
}

/* per-execution progress counters live outside React state so the engine
 * stays a pure event source; the store is the only thing that persists
 * cumulative done-counts via the events it receives. */
const doneCounters = new Map<string, number>()
function streamDone(executionId: string): number {
  return doneCounters.get(executionId) ?? 0
}
function setStreamDone(executionId: string, n: number) {
  doneCounters.set(executionId, n)
}
function hashSeed(executionId: string, n: number): number {
  let h = 0
  for (let i = 0; i < executionId.length; i++) h = (h * 31 + executionId.charCodeAt(i)) | 0
  return Math.abs(h + n * 97)
}

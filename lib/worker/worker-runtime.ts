/* ================================================================== *
 * WORKER RUNTIME — the execution engine.
 *
 * A WorkerRuntimeProvider takes a worker + a task and produces a
 * stream of ExecutionEvents over time. The Studio depends only on this
 * interface, so DeterministicWorkerRuntime can later be swapped for an
 * LLM- or backend-driven runtime with no UI changes.
 *
 * Timing lives HERE, in the runtime — never faked inside React
 * components. Components only react to emitted events.
 * ================================================================== */

import { nextEventId } from "./worker-events"
import type {
  Decision,
  ExecutionEvent,
  ExecutionEventType,
  EventStatus,
  Worker,
} from "./worker-model"
import { evaluateAction } from "./worker-policies"
import { extractCompany } from "./worker-evaluation"

export interface RunHandle {
  taskId: string
  approve: () => void
  reject: () => void
  cancel: () => void
}

export interface WorkerRuntimeProvider {
  run(worker: Worker, objective: string, taskId: string, emit: (e: ExecutionEvent) => void): RunHandle
}

interface PlannedStep {
  delay: number
  type: ExecutionEventType
  status: EventStatus
  capability?: string
  message: string
  metadata?: Record<string, unknown>
}

/* deterministic hash so the same objective always yields the same run */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

interface Derived {
  company: string
  sourcesTotal: number
  positive: number
  negative: number
  evidenceTotal: number
  confidence: number
  decision: Decision
  factors: string[]
  action: string
  outcome: string
}

function derive(objective: string): Derived {
  const company = extractCompany(objective)
  const h = hash(objective.toLowerCase())
  const sourcesTotal = 8 + (h % 9) // 8..16
  const positive = 3 + (h % 5) // 3..7
  const negative = (h >> 3) % 4 // 0..3
  const evidenceTotal = positive + negative + 2
  let confidence = 58 + positive * 5 - negative * 6 + ((h >> 5) % 11)
  confidence = Math.max(42, Math.min(97, confidence))
  const decision: Decision =
    confidence >= 75 ? "QUALIFIED" : confidence >= 62 ? "INCONCLUSIVE" : "NOT_QUALIFIED"
  const allFactors = [
    "Enterprise size (1,200+ employees)",
    "Technology stack fit",
    "Active hiring in RevOps",
    "Recent funding round",
    "Executive buying signal",
    "Existing vendor overlap",
  ]
  const factors = allFactors.slice(0, Math.max(2, positive))
  const action =
    decision === "QUALIFIED"
      ? `Outreach prepared for ${company}`
      : decision === "INCONCLUSIVE"
        ? `Follow-up research queued for ${company}`
        : `${company} deprioritized`
  const outcome =
    decision === "QUALIFIED"
      ? "Enterprise prospect identified."
      : decision === "INCONCLUSIVE"
        ? "More evidence required before qualifying."
        : "Not a fit at this time."
  return { company, sourcesTotal, positive, negative, evidenceTotal, confidence, decision, factors, action, outcome }
}

export class DeterministicWorkerRuntime implements WorkerRuntimeProvider {
  run(
    worker: Worker,
    objective: string,
    taskId: string,
    emit: (e: ExecutionEvent) => void,
  ): RunHandle {
    const d = derive(objective)
    const timers: ReturnType<typeof setTimeout>[] = []
    let cancelled = false
    let resume: ((granted: boolean) => void) | null = null

    const fire = (step: PlannedStep) => {
      if (cancelled) return
      emit({
        id: nextEventId(),
        taskId,
        timestamp: Date.now(),
        type: step.type,
        status: step.status,
        capability: step.capability,
        message: step.message,
        metadata: step.metadata,
      })
    }

    const at = (delay: number, fn: () => void) => {
      timers.push(setTimeout(fn, delay))
    }

    /* ---- phase 1: research + reasoning (always runs) ---- */
    const research = worker.capabilities.find((c) => c.name.toLowerCase() === "research")
    const hasWebSearch = worker.tools.find((t) => t.id === "web_search" && t.enabled)

    const preSteps: PlannedStep[] = [
      { delay: 200, type: "TASK_CREATED", status: "info", capability: "core", message: `Task created — ${d.company}`, metadata: { objective } },
      { delay: 700, type: "TASK_STARTED", status: "info", capability: "research", message: "Task started" },
      { delay: 700, type: "RESEARCH_STARTED", status: "info", capability: "research", message: `Researching ${d.company}` },
    ]
    if (hasWebSearch) {
      preSteps.push({ delay: 700, type: "TOOL_CALLED", status: "info", capability: "research", message: "Web Search invoked", metadata: { tool: "web_search" } })
    }
    // dribble out sources + evidence
    for (let i = 1; i <= 3; i++) {
      preSteps.push({
        delay: 550,
        type: "SOURCE_FOUND",
        status: "info",
        capability: "research",
        message: `Source discovered (${Math.round((d.sourcesTotal / 3) * i)} total)`,
        metadata: { sources: Math.round((d.sourcesTotal / 3) * i) },
      })
    }
    preSteps.push({
      delay: 650,
      type: "EVIDENCE_CREATED",
      status: "ok",
      capability: "research",
      message: `${d.evidenceTotal} evidence items · ${d.positive} positive / ${d.negative} negative`,
      metadata: { evidence: d.evidenceTotal, positive: d.positive, negative: d.negative, signals: d.positive + d.negative },
    })
    preSteps.push({ delay: 800, type: "REASONING_STARTED", status: "info", capability: "reasoning", message: "Evaluating enterprise fit" })
    preSteps.push({
      delay: 900,
      type: "DECISION_CREATED",
      status: d.decision === "NOT_QUALIFIED" ? "warn" : "ok",
      capability: "reasoning",
      message: `Decision — ${d.decision} · ${d.confidence}%`,
      metadata: { decision: d.decision, confidence: d.confidence, factors: d.factors },
    })
    preSteps.push({
      delay: 700,
      type: "ACTION_PREPARED",
      status: "info",
      capability: "communication",
      message: d.action,
      metadata: { action: d.action, actionType: "outbound_email" },
    })

    // schedule pre steps
    let elapsed = 0
    for (const s of preSteps) {
      elapsed += s.delay
      at(elapsed, () => fire(s))
    }

    /* ---- phase 2: policy gate + action + completion ---- */
    const finishSteps = (approved: boolean) => {
      let e = 0
      const seq: PlannedStep[] = []
      if (approved) {
        seq.push({ delay: 600, type: "ACTION_EXECUTED", status: "ok", capability: "execution", message: `${d.action} — executed`, metadata: { action: d.action } })
        const mem = d.decision === "QUALIFIED"
        if (mem) {
          seq.push({
            delay: 700,
            type: "MEMORY_PROPOSED",
            status: "info",
            capability: "memory",
            message: "New memory proposed",
            metadata: {
              memory: "Short enterprise outreach has a higher response probability.",
              confidence: 84,
            },
          })
        }
      } else {
        seq.push({ delay: 500, type: "ACTION_REJECTED", status: "warn", capability: "execution", message: "Action rejected by human" })
      }
      seq.push({
        delay: 700,
        type: "TASK_COMPLETED",
        status: "ok",
        capability: "core",
        message: approved ? "Task complete" : "Task complete (action rejected)",
        metadata: {
          decision: d.decision,
          confidence: d.confidence,
          sources: d.sourcesTotal,
          positive: d.positive,
          negative: d.negative,
          action: approved ? d.action : null,
          outcome: d.outcome,
          nextAction: nextActionText(d),
        },
      })
      for (const s of seq) {
        e += s.delay
        at(e, () => fire(s))
      }
    }

    // after the pre-steps, evaluate policy
    at(elapsed + 500, () => {
      if (cancelled) return
      const decision = evaluateAction(worker, {
        actionType: "outbound_email",
        confidence: d.confidence,
        riskLevel: "medium",
      })
      // a not-qualified decision has no outbound action to gate
      if (d.decision === "NOT_QUALIFIED") {
        finishSteps(true)
        return
      }
      if (decision.requiresApproval) {
        fire({
          delay: 0,
          type: "APPROVAL_REQUIRED",
          status: "warn",
          capability: "execution",
          message: "Approval required before executing action",
          metadata: {
            reason: decision.reason,
            policyText: decision.policyText,
            confidence: d.confidence,
            action: d.action,
          },
        })
        resume = (granted: boolean) => {
          fire({
            delay: 0,
            type: granted ? "APPROVAL_GRANTED" : "ACTION_REJECTED",
            status: granted ? "ok" : "warn",
            capability: "execution",
            message: granted ? "Approval granted" : "Rejected by human",
          })
          finishSteps(granted)
        }
      } else {
        finishSteps(true)
      }
    })

    return {
      taskId,
      approve: () => resume?.(true),
      reject: () => resume?.(false),
      cancel: () => {
        cancelled = true
        timers.forEach(clearTimeout)
      },
    }
  }
}

function nextActionText(d: Derived): string {
  if (d.decision === "QUALIFIED") return `Identify the economic buyer at ${d.company}.`
  if (d.decision === "NOT_QUALIFIED") return `Find a better-fit account similar to ${d.company}.`
  return `Gather more evidence on ${d.company}.`
}

export const deterministicRuntime = new DeterministicWorkerRuntime()

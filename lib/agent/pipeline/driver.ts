import "server-only"

/* ================================================================== *
 * PIPELINE DRIVER — generic, skill-agnostic folding of a resumable
 * skill's stage_* events into a persisted PipelineState (section 10:
 * "the UI must reflect the actual execution graph... each node must
 * have real state"). Consumed only by lib/agent/runtime.ts's emit()
 * closure — nothing here knows Salesforce, Slack, or any provider by
 * name; it only understands the generic shape { stage, label, ... }
 * every stage_* event carries, exactly the same "runtime never knows
 * a provider by name" discipline every other part of this codebase
 * already follows for connectors.
 * ================================================================== */

import type { PipelineObjective, PipelineStageKey, PipelineState, WorkerEventType } from "@/lib/workforce/model"
import { STAGE_ORDER } from "./types"

const STAGE_EVENT_TYPES = new Set<WorkerEventType>(["stage_started", "stage_completed", "stage_failed", "stage_blocked", "stage_skipped", "approval_required", "approval_rejected"])

export function isStageEvent(type: WorkerEventType): boolean {
  return STAGE_EVENT_TYPES.has(type)
}

export function initPipelineState(objective: PipelineObjective): PipelineState {
  return {
    objective,
    stages: STAGE_ORDER.map(({ key, label }) => ({ key, label, status: "queued" as const })),
  }
}

interface StageEventPayload {
  stage?: PipelineStageKey
  label?: string
  objective?: PipelineObjective
  detail?: string
  reasonCode?: string
  provider?: string
  action?: string
  idempotencyKey?: string
  attempts?: number
  output?: unknown
  latencyMs?: number
}

/** Pure fold: given the state so far (undefined at the very start of
 * a fresh run) and one real stage_* event, returns the next state.
 * Never mutates its input — callers hold the returned value. */
export function foldStageEvent(state: PipelineState | undefined, type: WorkerEventType, payload: Record<string, unknown>, now: number): PipelineState | undefined {
  const p = payload as StageEventPayload
  if (!p.stage) return state // not a stage-scoped event (or a plain approval_required with no stage context)

  const base = state ?? (p.objective ? initPipelineState(p.objective) : undefined)
  if (!base) return state // no objective seen yet — nothing to initialize against

  const stages = base.stages.map((s) => {
    if (s.key !== p.stage) return s
    switch (type) {
      case "stage_started":
        return { ...s, status: "running" as const, startedAt: now }
      case "stage_completed":
        return {
          ...s,
          status: "completed" as const,
          completedAt: now,
          latencyMs: p.latencyMs ?? (s.startedAt ? now - s.startedAt : undefined),
          detail: p.detail,
          provider: p.provider,
          action: p.action,
          idempotencyKey: p.idempotencyKey,
          attempts: p.attempts,
          output: p.output,
        }
      case "stage_failed":
        return { ...s, status: "failed" as const, completedAt: now, detail: p.detail, reasonCode: p.reasonCode as never }
      case "stage_blocked":
        return { ...s, status: "blocked" as const, completedAt: now, detail: p.detail }
      case "stage_skipped":
        return { ...s, status: "skipped" as const, completedAt: now, detail: p.detail }
      case "approval_required":
        return { ...s, status: "waiting_for_approval" as const, completedAt: now, detail: p.detail }
      case "approval_rejected":
        return { ...s, status: "rejected" as const, completedAt: now, detail: p.detail }
      default:
        return s
    }
  })

  return { ...base, stages }
}

/** After a rejection, every stage still "queued" downstream of the
 * rejected one is genuinely never going to run — mark it "skipped"
 * with the real reason, rather than leaving it looking merely
 * unstarted. Pure; the caller persists the result. */
export function skipDownstreamStages(state: PipelineState, fromKey: PipelineStageKey): PipelineState {
  const fromIdx = STAGE_ORDER.findIndex((s) => s.key === fromKey)
  const stages = state.stages.map((s, i) => (i > fromIdx && s.status === "queued" ? { ...s, status: "skipped" as const, detail: "Skipped — a prior action was rejected." } : s))
  return { ...state, stages }
}

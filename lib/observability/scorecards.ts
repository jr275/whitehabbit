/* ================================================================== *
 * SCORECARDS — real observability, computed only from persisted events
 * (executions/tasks/outputs/events already in the store — the same
 * ledger every other surface reads). No number here is calculated from
 * hardcoded fixtures or a frontend-only counter; every one either comes
 * straight from a real WorkerExecution/WorkerOutput/WorkerEvent row or
 * is null/omitted when there is genuinely nothing to compute yet —
 * never a fabricated 0 standing in for "no data".
 *
 * Same category as lib/workforce/selectors.ts — pure, client-safe
 * projections. Agent/Skill/Model/Tool scorecards are the same shape,
 * just grouped by a different real key.
 * ================================================================== */

import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import type { WorkerEvent, WorkerExecution, WorkerOutput, WorkerTask } from "@/lib/workforce/model"

export interface Scorecard {
  executions: number
  /** null = no finished execution yet — never a fabricated 100%/0%. */
  successRate: number | null
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  /** null = cost genuinely unavailable (no rate configured); 0 = real
   * zero (nothing that consumed tokens ran) — see lib/agent/cost.ts. */
  aiCostUsd: number | null
  costPerExecution: number | null
  costPerSuccessfulExecution: number | null
  avgEvaluationScore: number | null
  failureReasons: { reason: string; count: number }[]
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1))
  return sortedAsc[idx]
}

const FAILURE_REASON_LABEL: Record<string, string> = {
  missing_credential: "Missing credential",
  invalid_credential: "Invalid credential",
  provider_error: "Provider error",
  execution_error: "Execution error",
}

/** The one real computation every scorecard (agent/skill/model/tool)
 * is built from — callers filter `executions`/`outputs` to the real
 * subset the scorecard is about (one worker, one skill's tasks, one
 * model) before calling this. */
export function computeScorecard(executions: WorkerExecution[], outputs: WorkerOutput[]): Scorecard {
  const finished = executions.filter((e) => e.status !== "running" && e.status !== "queued")
  const completed = finished.filter((e) => e.status === "completed")
  const successRate = finished.length ? Math.round((completed.length / finished.length) * 1000) / 10 : null

  const durations = completed
    .map((e) => e.durationMs)
    .filter((d): d is number => typeof d === "number")
    .sort((a, b) => a - b)
  const p50LatencyMs = percentile(durations, 50)
  const p95LatencyMs = percentile(durations, 95)

  // Same real vs unavailable-vs-zero distinction as
  // lib/workforce/selectors.ts's headerMetrics().
  const costBearing = finished.filter((e) => e.inputTokens != null)
  const costed = costBearing.filter((e) => e.costUsd != null)
  const aiCostUsd = costBearing.length === 0 ? 0 : costed.length === 0 ? null : costed.reduce((s, e) => s + (e.costUsd ?? 0), 0)
  const costPerExecution = aiCostUsd != null && finished.length > 0 ? Math.round((aiCostUsd / finished.length) * 10000) / 10000 : null
  const costPerSuccessfulExecution = aiCostUsd != null && completed.length > 0 ? Math.round((aiCostUsd / completed.length) * 10000) / 10000 : null

  const executionIds = new Set(completed.map((e) => e.id))
  const scoredOutputs = outputs.filter((o) => executionIds.has(o.executionId) && o.qualityScore != null)
  const avgEvaluationScore = scoredOutputs.length ? Math.round(scoredOutputs.reduce((s, o) => s + (o.qualityScore ?? 0), 0) / scoredOutputs.length) : null

  const failed = finished.filter((e) => e.status !== "completed")
  const reasonCounts = new Map<string, number>()
  for (const e of failed) {
    const label = e.reasonCode ? (FAILURE_REASON_LABEL[e.reasonCode] ?? e.reasonCode) : e.status === "blocked" ? "Blocked" : e.status === "pending_approval" ? "Pending approval" : "Failed"
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1)
  }

  return {
    executions: executions.length,
    successRate,
    p50LatencyMs,
    p95LatencyMs,
    aiCostUsd,
    costPerExecution,
    costPerSuccessfulExecution,
    avgEvaluationScore,
    failureReasons: Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  }
}

/** Agent Scorecard (section 15) — one Worker's real numbers. */
export function agentScorecard(workerId: string, executions: WorkerExecution[], outputs: WorkerOutput[]): Scorecard {
  return computeScorecard(
    executions.filter((e) => e.workerId === workerId),
    outputs.filter((o) => o.workerId === workerId),
  )
}

export interface NamedScorecard {
  key: string
  label: string
  scorecard: Scorecard
}

/** Skill Scorecard (section 16) — grouped by the real skillId a task
 * actually ran, for one worker. A skill with zero executions is
 * omitted, never shown with fabricated zeros. */
export function skillScorecards(workerId: string, tasks: WorkerTask[], executions: WorkerExecution[], outputs: WorkerOutput[]): NamedScorecard[] {
  const workerTasks = tasks.filter((t) => t.workerId === workerId)
  const skillIds = Array.from(new Set(workerTasks.map((t) => t.skillId)))
  const out: NamedScorecard[] = []
  for (const skillId of skillIds) {
    const taskIds = new Set(workerTasks.filter((t) => t.skillId === skillId).map((t) => t.id))
    const skillExecutions = executions.filter((e) => e.workerId === workerId && taskIds.has(e.taskId))
    if (skillExecutions.length === 0) continue
    const template = SKILL_CATALOG.find((s) => s.id === skillId)
    out.push({ key: skillId, label: template?.name ?? skillId, scorecard: computeScorecard(skillExecutions, outputs) })
  }
  return out.sort((a, b) => b.scorecard.executions - a.scorecard.executions)
}

/** Model Scorecard (section 17) — grouped by the real model string
 * each WorkerExecution recorded (a real model or provider name never
 * needs to be known ahead of time; whatever ran is what shows up). */
export function modelScorecards(workerId: string, executions: WorkerExecution[], outputs: WorkerOutput[]): NamedScorecard[] {
  const workerExecutions = executions.filter((e) => e.workerId === workerId && e.model)
  const models = Array.from(new Set(workerExecutions.map((e) => e.model!)))
  return models
    .map((model) => ({ key: model, label: model, scorecard: computeScorecard(workerExecutions.filter((e) => e.model === model), outputs) }))
    .sort((a, b) => b.scorecard.executions - a.scorecard.executions)
}

/** Tool Scorecard (section 18) — real tool_called/tool_completed event
 * counts for one worker. Latency comes from tool_completed's own real
 * durationMs; a call with no matching completion (blocked/failed
 * before the tool returned) counts against success rate but has no
 * latency sample. */
export interface ToolScorecard {
  toolId: string
  calls: number
  completions: number
  successRate: number | null
  p95LatencyMs: number | null
}

export function toolScorecards(workerId: string, events: WorkerEvent[]): ToolScorecard[] {
  const workerEvents = events.filter((e) => e.workerId === workerId)
  const called = workerEvents.filter((e) => e.type === "tool_called")
  const completed = workerEvents.filter((e) => e.type === "tool_completed")
  const toolIds = Array.from(new Set(called.map((e) => String(e.payload.tool ?? ""))).values()).filter(Boolean)

  return toolIds
    .map((toolId) => {
      const calls = called.filter((e) => e.payload.tool === toolId).length
      const completions = completed.filter((e) => e.payload.tool === toolId)
      const durations = completions.map((e) => Number(e.payload.durationMs)).filter((d) => Number.isFinite(d)).sort((a, b) => a - b)
      return {
        toolId,
        calls,
        completions: completions.length,
        successRate: calls > 0 ? Math.round((completions.length / calls) * 1000) / 10 : null,
        p95LatencyMs: percentile(durations, 95),
      }
    })
    .sort((a, b) => b.calls - a.calls)
}

/** Agent Health (section 19) — derived only from real runtime signals;
 * never hardcoded. Starts with the cleanest real signal (success rate
 * over finished executions) — latency-degradation/integration-health
 * inputs are a real future extension, not simulated here. */
export type AgentHealthState = "healthy" | "degraded" | "failing" | "no_data"

export function computeAgentHealth(scorecard: Scorecard): AgentHealthState {
  if (scorecard.executions === 0 || scorecard.successRate == null) return "no_data"
  if (scorecard.successRate >= 90) return "healthy"
  if (scorecard.successRate >= 60) return "degraded"
  return "failing"
}

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

import type { SkillCategory } from "@/lib/workforce/model"

/* ---- permission / risk vocabulary (section 16) ---- */
export type ToolPermission = "read" | "write" | "publish" | "delete" | "financial" | "external_communication"
export type RiskLevel = "low" | "medium" | "high" | "critical"

/* ---- tools: real, invocable capabilities ---- */
export interface ToolActionResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  blocked?: boolean
  blockedReason?: string
  /** real, measurable facts about this call — never estimated */
  durationMs: number
  costUsd?: number
}

export interface ToolContext {
  workerId: string
  executionId: string
  /** emit a real runtime event as this call happens */
  emit: (type: RuntimeEventType, payload: Record<string, unknown>) => void
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
}

/* ---- runtime events — every one must correspond to something real ---- */
export type RuntimeEventType =
  | "task_started"
  | "skill_started"
  | "tool_called"
  | "tool_completed"
  | "tool_blocked"
  | "reasoning_started"
  | "reasoning_completed"
  | "output_created"
  | "metric_recorded"
  | "task_completed"
  | "task_failed"
  | "task_blocked"

export class SkillBlockedError extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = "SkillBlockedError"
  }
}

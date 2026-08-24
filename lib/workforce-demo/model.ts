/* ================================================================== *
 * WhiteHabbit — DEMO WORKFORCE LAYER (model)
 *
 * This is a DEMO layer, intentionally separate from the real,
 * server-backed runtime in `lib/workforce/`. It exists to portray the
 * full vision — a living org of AI workers, each owning Skills-as-IP
 * and learned Heuristics — at a fidelity the single-vertical real
 * runtime cannot yet reach.
 *
 * Nothing here calls a real external system. Execution is produced by
 * a deterministic DemoExecutionProvider (see ./execution.ts) behind a
 * narrow interface, so a real provider can replace it later without
 * touching the UI. Where it makes sense we reuse the real model's
 * vocabulary so the two layers can converge.
 * ------------------------------------------------------------------ */

import type { Autonomy, SkillCategory } from "@/lib/workforce/model"

export type { Autonomy, SkillCategory }

/* ------------------------------- org ------------------------------ */

/** Where a worker sits in the division. Managers coordinate; ICs execute. */
export type OrgRole = "lead" | "specialist"

export type WorkerState = "idle" | "working" | "blocked" | "learning"

export const WORKER_STATE_META: Record<
  WorkerState,
  { label: string; tone: "good" | "info" | "warn" | "muted" }
> = {
  idle: { label: "Idle", tone: "muted" },
  working: { label: "Working", tone: "info" },
  blocked: { label: "Needs approval", tone: "warn" },
  learning: { label: "Learning", tone: "good" },
}

/* --------------------------- Skills-as-IP ------------------------- *
 * A Skill is not a toggle — it is proprietary know-how the worker
 * owns: an ordered execution recipe plus the heuristics it has
 * learned from doing the work. Skills have a maturity that grows with
 * runs and can be transferred between workers (that transfer is the
 * IP moving). */

export type SkillMaturity = "seed" | "practiced" | "expert" | "mastered"

export const SKILL_MATURITY_META: Record<
  SkillMaturity,
  { label: string; rank: number; min: number }
> = {
  seed: { label: "Seed", rank: 0, min: 0 },
  practiced: { label: "Practiced", rank: 1, min: 40 },
  expert: { label: "Expert", rank: 2, min: 70 },
  mastered: { label: "Mastered", rank: 3, min: 90 },
}

/** One deterministic step of a Skill's execution recipe. */
export interface RecipeStep {
  id: string
  /** imperative label, e.g. "Pull 90-day spend by channel" */
  action: string
  /** what it consumes */
  inputs: string[]
  /** what it produces for later steps */
  output: string
  /** tool/skill it leans on, if any */
  tool?: string
  /** demo-time cost signal, in seconds */
  seconds: number
}

/** A learned rule — the worker's judgment, earned from real runs. */
export interface Heuristic {
  id: string
  /** condition, e.g. "CAC rises >15% w/w on a channel" */
  when: string
  /** learned response, e.g. "shift 20% budget to next-best ROAS channel" */
  then: string
  /** 0..1 — how sure the worker is */
  confidence: number
  /** how many runs taught this */
  evidenceRuns: number
  /** when it was last reinforced */
  learnedFrom: string
}

export interface Skill {
  id: string
  name: string
  category: SkillCategory
  /** the proprietary value proposition of this skill in one line */
  ip: string
  maturity: SkillMaturity
  /** 0..100 — drives maturity + shown as mastery */
  proficiency: number
  runs: number
  recipe: RecipeStep[]
  heuristics: Heuristic[]
  /** worker id this skill was transferred from, if any (lineage) */
  inheritedFrom?: string
}

/* ------------------------------ worker ---------------------------- */

export interface DemoWorker {
  id: string
  name: string
  /** two-letter monogram for the token */
  initials: string
  /** role title, e.g. "Paid Media Optimizer" */
  title: string
  accent: string
  role: OrgRole
  /** manager's worker id (leads have none) */
  managerId?: string
  mandate: string
  autonomy: Autonomy
  state: WorkerState
  /** 0..100 composite competence, derived from skills */
  skillIds: string[]
  /** primary KPI this worker moves */
  primaryKpi: string
  /** hire date, for tenure */
  hiredAt: string
}

/* ----------------------------- outcomes --------------------------- *
 * The workforce is judged by business outcomes, not activity. A
 * WorkOutcome is a concrete, dated result attributed to a worker. */

export type OutcomeTone = "up" | "down" | "flat"

export interface WorkOutcome {
  id: string
  workerId: string
  skillId: string
  /** what changed, e.g. "Blended CAC" */
  metric: string
  /** human value, e.g. "−18%" */
  delta: string
  tone: OutcomeTone
  /** one-line narrative of how it happened */
  summary: string
  /** monetary impact estimate in USD, if any */
  valueUsd?: number
  at: string
}

/* --------------------------- live activity ------------------------ */

export type ActivityKind =
  | "run_started"
  | "step"
  | "insight"
  | "outcome"
  | "blocked"
  | "learned"
  | "run_completed"

export interface ActivityEvent {
  id: string
  workerId: string
  kind: ActivityKind
  text: string
  /** optional skill this relates to */
  skillId?: string
  at: number
}

/* ------------------------------ division -------------------------- */

export interface Division {
  id: string
  name: string
  /** the outcome the whole division is assembled around */
  mandate: string
  primaryKpi: string
  createdAt: string
}

/* --------------------- execution provider seam -------------------- *
 * The one seam a real runtime would implement. The UI depends ONLY on
 * this interface, never on the demo internals — see ./execution.ts. */

export interface ExecutionUpdate {
  events: ActivityEvent[]
  /** worker state after this update */
  state: WorkerState
  /** produced once, on completion */
  outcome?: WorkOutcome
  done: boolean
}

export interface ExecutionProvider {
  /** deterministic, streamed run of one worker's skill against a task */
  run(input: {
    worker: DemoWorker
    skill: Skill
    task: string
  }): AsyncGenerator<ExecutionUpdate>
  readonly label: string
  readonly isDemo: boolean
}

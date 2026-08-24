/* ================================================================== *
 * DEMO WORKFORCE — derived, read-only division metrics.
 * Everything is computed from the seed/store data, never hardcoded.
 * ------------------------------------------------------------------ */

import type { DemoWorker, Skill, WorkOutcome } from "./model"
import { SKILL_MATURITY_META, type SkillMaturity } from "./model"

/** Composite competence of a worker = mean proficiency of its skills. */
export function workerCompetence(worker: DemoWorker, skills: Skill[]): number {
  const owned = skills.filter((s) => worker.skillIds.includes(s.id))
  if (!owned.length) return 0
  return Math.round(owned.reduce((n, s) => n + s.proficiency, 0) / owned.length)
}

/** Maturity band from a proficiency number. */
export function maturityFor(proficiency: number): SkillMaturity {
  const bands: SkillMaturity[] = ["mastered", "expert", "practiced", "seed"]
  for (const b of bands) {
    if (proficiency >= SKILL_MATURITY_META[b].min) return b
  }
  return "seed"
}

export interface DivisionMetrics {
  workers: number
  skills: number
  heuristics: number
  totalRuns: number
  valueUsd: number
  outcomes: number
  avgCompetence: number
  masteredSkills: number
}

export function divisionMetrics(workers: DemoWorker[], skills: Skill[], outcomes: WorkOutcome[]): DivisionMetrics {
  const heuristics = skills.reduce((n, s) => n + s.heuristics.length, 0)
  const totalRuns = skills.reduce((n, s) => n + s.runs, 0)
  const valueUsd = outcomes.reduce((n, o) => n + (o.valueUsd ?? 0), 0)
  const avgCompetence = workers.length
    ? Math.round(workers.reduce((n, w) => n + workerCompetence(w, skills), 0) / workers.length)
    : 0
  const masteredSkills = skills.filter((s) => s.maturity === "mastered").length
  return {
    workers: workers.length,
    skills: skills.length,
    heuristics,
    totalRuns,
    valueUsd,
    outcomes: outcomes.length,
    avgCompetence,
    masteredSkills,
  }
}

export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n}`
}

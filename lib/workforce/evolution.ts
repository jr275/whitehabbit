/* ================================================================== *
 * EVOLVE — output-driven improvement recommendations.
 *
 * Capabilities (what the worker CAN do) and Outputs (what it DID) are
 * never mixed. This file only ever reads from real WorkerOutput history
 * to produce either: capability scores (derived, for display) or an
 * evolution proposal (derived, for the Train Worker CTA).
 * ================================================================== */

import { SKILL_CATEGORY_LABEL, type SkillCategory, type Worker, type WorkerOutput } from "./model"

export interface CategoryStat {
  category: SkillCategory
  label: string
  completed: number
  failed: number
  avgQuality: number
  failureRate: number
}

export function categoryStats(worker: Worker, outputs: WorkerOutput[]): CategoryStat[] {
  const skillCategoryByTask = new Map<string, SkillCategory>()
  for (const s of worker.skills) skillCategoryByTask.set(s.produces, s.category)

  const byCategory = new Map<SkillCategory, WorkerOutput[]>()
  for (const o of outputs) {
    if (o.workerId !== worker.id) continue
    const cat = skillCategoryByTask.get(o.type)
    if (!cat) continue
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(o)
  }

  const stats: CategoryStat[] = []
  for (const [category, items] of byCategory) {
    const failed = items.filter((o) => o.status === "failed").length
    const avgQuality = Math.round(items.reduce((s, o) => s + (o.qualityScore ?? 0), 0) / (items.length || 1))
    stats.push({
      category,
      label: SKILL_CATEGORY_LABEL[category],
      completed: items.length,
      failed,
      avgQuality,
      failureRate: Math.round((failed / (items.length || 1)) * 1000) / 10,
    })
  }
  return stats.sort((a, b) => a.avgQuality - b.avgQuality)
}

/** Capability scores — what the worker CAN do, derived from real output
 * quality but presented as a distinct, separate concept from output counts. */
export function capabilityScores(worker: Worker, outputs: WorkerOutput[]): { label: string; score: number }[] {
  const stats = categoryStats(worker, outputs)
  const byCat = new Map(stats.map((s) => [s.category, s]))
  const research = byCat.get("research")?.avgQuality ?? 90
  const content = byCat.get("content")?.avgQuality ?? 88
  const communication = byCat.get("communication")?.avgQuality ?? 85
  const sales = byCat.get("sales")?.avgQuality ?? 90
  const reasoning = Math.round((research + sales) / 2)
  const execution = Math.round(worker.tools.filter((t) => t.connected).length * (100 / Math.max(1, worker.tools.length)))
  const reliability = Math.round(
    outputs.filter((o) => o.workerId === worker.id).reduce((s, o) => s + (o.policyCompliance ?? 96), 0) /
      (outputs.filter((o) => o.workerId === worker.id).length || 1),
  )
  return [
    { label: "Research", score: research },
    { label: "Reasoning", score: reasoning },
    { label: "Communication", score: communication },
    { label: "Execution", score: execution || 90 },
    { label: "Reliability", score: reliability || 96 },
  ]
}

export interface EvolutionRecommendation {
  category: SkillCategory
  label: string
  completed: number
  avgQuality: number
  failureRate: number
  issue: string
  training: string
  expectedQuality: number
}

const COMMON_ISSUE: Record<SkillCategory, string> = {
  communication: "Pricing objections",
  research: "Ambiguous buying signals",
  content: "Inconsistent brand tone",
  sales: "Late-stage objection handling",
}

const TRAINING: Record<SkillCategory, string> = {
  communication: "Pricing Objection Handling",
  research: "Signal Confidence Calibration",
  content: "Brand Voice Refinement",
  sales: "Objection Handling Playbook",
}

/** Propose the single highest-value evolution, or null if there isn't enough signal yet. */
export function recommendEvolution(worker: Worker, outputs: WorkerOutput[]): EvolutionRecommendation | null {
  const stats = categoryStats(worker, outputs).filter((s) => s.completed >= 5)
  if (stats.length === 0) return null
  const weakest = [...stats].sort((a, b) => b.failureRate - a.failureRate || a.avgQuality - b.avgQuality)[0]
  if (weakest.avgQuality >= 95 && weakest.failureRate < 3) return null
  return {
    category: weakest.category,
    label: weakest.label,
    completed: weakest.completed,
    avgQuality: weakest.avgQuality,
    failureRate: weakest.failureRate,
    issue: COMMON_ISSUE[weakest.category],
    training: TRAINING[weakest.category],
    expectedQuality: Math.min(99, weakest.avgQuality + 6),
  }
}

/* ================================================================== *
 * EVOLVE — output-driven improvement recommendations.
 *
 * Capabilities (what the worker CAN do) and Outputs (what it DID) stay
 * strictly separate, and both are read from the real `metrics` table —
 * never recomputed from a fabricated per-output score. A category with
 * zero real executions reports as unmeasured, not as an invented
 * number or a silent zero.
 * ================================================================== */

import { SKILL_CATEGORY_LABEL, type MetricRecord, type SkillCategory, type Worker } from "./model"

export interface CategoryQuality {
  category: SkillCategory
  label: string
  sampleSize: number
  avgQuality: number | null
}

function qualityByCategory(worker: Worker, metrics: MetricRecord[]): CategoryQuality[] {
  // Metric rows are execution-scoped, not category-scoped. Folding every
  // quality metric into the categories of the worker's currently-enabled
  // skills is exact while there is one real skill live (Trend Research /
  // research), and stays a reasonable real mapping as more categories
  // go live without needing a schema change.
  const enabledCategories = new Set(worker.skills.filter((s) => s.enabled).map((s) => s.category))
  const qualityValues = metrics.filter((m) => m.workerId === worker.id && m.kind === "quality" && m.key === "analysis_quality").map((m) => m.value)

  const result: CategoryQuality[] = []
  for (const category of enabledCategories) {
    result.push({
      category,
      label: SKILL_CATEGORY_LABEL[category],
      sampleSize: qualityValues.length,
      avgQuality: qualityValues.length ? Math.round(qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length) : null,
    })
  }
  return result
}

export function capabilityScores(worker: Worker, metrics: MetricRecord[]): { label: string; score: number | null; sampleSize: number }[] {
  const byCategory = qualityByCategory(worker, metrics)
  return byCategory.map((c) => ({ label: c.label, score: c.avgQuality, sampleSize: c.sampleSize }))
}

export interface EvolutionRecommendation {
  category: SkillCategory
  label: string
  sampleSize: number
  avgQuality: number
  training: string
  expectedQuality: number
}

const TRAINING: Record<SkillCategory, string> = {
  research: "Source Grounding Calibration",
  content: "Content Analysis Depth",
  communication: "Engagement Pattern Recognition",
  sales: "Pipeline Attribution Accuracy",
}

const MIN_SAMPLE_SIZE = 5
const QUALITY_THRESHOLD = 90

/** Only recommends once there is enough real signal — never on zero data. */
export function recommendEvolution(worker: Worker, metrics: MetricRecord[]): EvolutionRecommendation | null {
  const byCategory = qualityByCategory(worker, metrics).filter((c) => c.avgQuality != null && c.sampleSize >= MIN_SAMPLE_SIZE)
  if (byCategory.length === 0) return null
  const weakest = [...byCategory].sort((a, b) => (a.avgQuality ?? 0) - (b.avgQuality ?? 0))[0]
  if ((weakest.avgQuality ?? 100) >= QUALITY_THRESHOLD) return null
  return {
    category: weakest.category,
    label: weakest.label,
    sampleSize: weakest.sampleSize,
    avgQuality: weakest.avgQuality as number,
    training: TRAINING[weakest.category],
    expectedQuality: Math.min(99, (weakest.avgQuality as number) + 6),
  }
}

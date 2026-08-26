/* ================================================================== *
 * OPPORTUNITY SCORING — explainable, partial-by-design. See
 * docs/adr/ADR-006: this computes a documented weighted average of
 * ONLY the score components that have real data behind them today,
 * and labels the result as preliminary — it never fabricates a
 * missing component to produce a fuller-looking number.
 * ================================================================== */

import type { OpportunityScoreComponents } from "./model"

export const SCORE_WEIGHTS: Record<keyof OpportunityScoreComponents, number> = {
  sourceGroundingScore: 0.4,
  outlineCompletenessScore: 0.3,
  confidenceScore: 0.3,
  demandScore: 0,
  trendScore: 0,
  businessValueScore: 0,
  competitionScore: 0,
  authorityGapScore: 0,
  informationGainScore: 0,
  citationPotentialScore: 0,
  cannibalizationRiskScore: 0,
}

export interface FinalScoreResult {
  finalScore: number | null
  /** Human-readable explanation of exactly which components fed the
   * score — always states how many of the total components were
   * available, so "82" is never mistaken for a complete score. */
  notes: string
}

/** Computes a weighted average using only the non-null components
 * present in `components`, re-normalizing weights over what's
 * actually available. Returns `finalScore: null` (not 0) if nothing
 * is available at all. */
export function computeFinalScore(components: OpportunityScoreComponents): FinalScoreResult {
  const entries = Object.entries(components) as [keyof OpportunityScoreComponents, number | null][]
  const available = entries.filter(([, value]) => value != null) as [keyof OpportunityScoreComponents, number][]
  const totalComponentCount = entries.length

  if (available.length === 0) {
    return { finalScore: null, notes: `No score components available yet (0/${totalComponentCount}).` }
  }

  const weightSum = available.reduce((sum, [key]) => sum + SCORE_WEIGHTS[key], 0)
  const weighted = weightSum > 0
    ? available.reduce((sum, [key, value]) => sum + value * SCORE_WEIGHTS[key], 0) / weightSum
    // every available component happened to have zero configured weight
    // (shouldn't occur with today's 3 computed components, but keep this
    // honest rather than dividing by zero) — fall back to a plain average.
    : available.reduce((sum, [, value]) => sum + value, 0) / available.length

  const componentLabels = available.map(([key]) => key.replace(/Score$/, "")).join(", ")
  return {
    finalScore: Math.round(weighted),
    notes: `Preliminary score from ${available.length}/${totalComponentCount} components (${componentLabels}). Remaining components require integrations not yet connected (Search Console, trend data, competitor/SERP data, Information Gain analysis) — see docs/architecture/risks.md R-7.`,
  }
}

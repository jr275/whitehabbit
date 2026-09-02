import "server-only"

/* ================================================================== *
 * MARKETING EVOLUTION — real, execution-history-driven improvement
 * recommendations for a specific Marketing skill (not the coarser,
 * category-level lib/workforce/evolution.ts, which this doesn't
 * replace — a genuinely different granularity, additive alongside it).
 *
 * NEVER auto-rewrites a production skill. This module only ever
 * returns a real, computed recommendation — a human reviews and
 * promotes it (a new skill version, or a new/updated heuristic) via
 * whatever process an operator already uses; nothing here writes to
 * SKILL_REGISTRY, MARKETING_HEURISTIC_CATALOG, or any DB row.
 *
 * WHY "unclassified share", not literally the brief's illustrative
 * "branded query false positives": Search Waste Detection's own
 * heuristic (lib/marketing/heuristics.ts's detectWasteOpportunities)
 * structurally EXCLUDES branded-intent terms from every waste
 * opportunity — a branded false positive cannot occur in this
 * implementation, so recommending a fix for one would be inventing a
 * problem that doesn't exist. The real, analogous, currently-occurring
 * signal this skill's own execution history can actually support is
 * classifier COVERAGE: a search term below the minimum click
 * threshold, or matching none of the intent patterns, is honestly left
 * "unknown" (lib/marketing/heuristics.ts's classifySearchTermIntent)
 * — real waste inside that share goes undetected. This module
 * measures that real gap, deterministically, across real past
 * executions' persisted intentBreakdown.
 * ================================================================== */

import { listRecentOutputs } from "@/lib/db/repo"

export interface MarketingEvolutionRecommendation {
  skillId: string
  currentVersion: string
  proposedVersion: string
  kind: "new_heuristic" | "skill_version"
  finding: string
  recommendation: string
  /** How many real, completed search_waste_report executions this
   * recommendation is based on — never fewer than MIN_SAMPLE_SIZE. */
  sampleSize: number
  unclassifiedSharePercent: number
}

const MIN_SAMPLE_SIZE = 5
/** 25%+ of a dataset's search terms landing "unknown" is real,
 * material classifier coverage loss — a named, deliberate threshold,
 * not a magic number. */
const UNKNOWN_SHARE_THRESHOLD = 0.25

interface SearchWasteReportShape {
  intentBreakdown?: Record<string, number>
}

/** Real, deterministic — reads only real, already-persisted
 * WorkerOutput.structured.intentBreakdown across real past executions
 * (lib/db/repo.ts's listRecentOutputs, org-scoped). Returns null when
 * there isn't yet enough real signal (fewer than MIN_SAMPLE_SIZE real
 * executions) or when real coverage is already adequate — never a
 * recommendation manufactured from insufficient or nonexistent data. */
export async function recommendSearchWasteEvolution(orgId: string, workerId?: string): Promise<MarketingEvolutionRecommendation | null> {
  const outputs = await listRecentOutputs(orgId, { workerId, limit: 50 })
  const relevant = outputs.filter((o) => o.type === "search_waste_report" && o.status === "completed" && o.structured)
  if (relevant.length < MIN_SAMPLE_SIZE) return null

  let totalTerms = 0
  let unknownTerms = 0
  for (const output of relevant) {
    const breakdown = (output.structured as SearchWasteReportShape).intentBreakdown ?? {}
    for (const [intent, count] of Object.entries(breakdown)) {
      totalTerms += count
      if (intent === "unknown") unknownTerms += count
    }
  }
  if (totalTerms === 0) return null

  const unknownShare = unknownTerms / totalTerms
  if (unknownShare < UNKNOWN_SHARE_THRESHOLD) return null

  const sharePercent = Math.round(unknownShare * 100)
  return {
    skillId: "skill_search_waste_detection",
    currentVersion: "1.0",
    proposedVersion: "1.1",
    kind: "new_heuristic",
    finding: `Across ${relevant.length} real executions, ${sharePercent}% of classified search terms landed "unknown" intent — real waste inside that share is not currently being detected.`,
    recommendation: "Expand the high-intent/informational/waste-signal keyword patterns (lib/marketing/heuristics.ts) to cover more of this worker's real search-term vocabulary — proposed as a new heuristic version, not an automatic change.",
    sampleSize: relevant.length,
    unclassifiedSharePercent: sharePercent,
  }
}

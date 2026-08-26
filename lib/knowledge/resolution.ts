/* ================================================================== *
 * ENTITY RESOLUTION — the first usable version (§7). Normalizes names,
 * scores similarity against existing entities of the same type in the
 * same project, and applies configurable confidence thresholds:
 *
 *   >= autoMergeThreshold   -> automatic merge (real, auditable)
 *   >= reviewThreshold      -> candidate for human review
 *   <  reviewThreshold      -> kept separate, no candidate recorded
 *
 * Never silently merges a low-confidence match. Every automatic merge
 * is recorded in entity_merge_candidates with status "auto_merged" —
 * "automatic" does not mean "unaudited".
 *
 * Pure string similarity (Sørensen-Dice over character bigrams) — no
 * embedding/vector dependency (ADR-009 defers that until a real
 * consumer needs it); good enough to catch real near-duplicates like
 * "Moema" vs "moema " or "Acme Corp" vs "Acme Corporation" without a
 * new infrastructure dependency.
 * ================================================================== */

export interface ResolutionThresholds {
  autoMerge: number
  review: number
}

export const DEFAULT_RESOLUTION_THRESHOLDS: ResolutionThresholds = { autoMerge: 0.95, review: 0.75 }

export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function bigrams(s: string): string[] {
  if (s.length < 2) return [s]
  const result: string[] = []
  for (let i = 0; i < s.length - 1; i++) result.push(s.slice(i, i + 2))
  return result
}

/** Sørensen-Dice coefficient over character bigrams — 1.0 for
 * identical strings, 0.0 for strings sharing no bigrams. Symmetric. */
export function nameSimilarity(a: string, b: string): number {
  const normA = normalizeEntityName(a)
  const normB = normalizeEntityName(b)
  if (normA === normB) return 1
  if (!normA || !normB) return 0
  const bigramsA = bigrams(normA)
  const bigramsB = bigrams(normB)
  const counts = new Map<string, number>()
  for (const bg of bigramsA) counts.set(bg, (counts.get(bg) ?? 0) + 1)
  let overlap = 0
  for (const bg of bigramsB) {
    const remaining = counts.get(bg) ?? 0
    if (remaining > 0) {
      overlap += 1
      counts.set(bg, remaining - 1)
    }
  }
  return (2 * overlap) / (bigramsA.length + bigramsB.length)
}

export interface SimilarityCandidate {
  id: string
  name: string
}

export interface ResolutionDecision {
  decision: "auto_merge" | "review_candidate" | "distinct"
  bestMatch: SimilarityCandidate | null
  confidence: number
}

/** Pure decision function — no I/O, fully unit-testable. Callers
 * (lib/knowledge/repo.ts's resolveOrCreateEntity) do the actual entity
 * creation/merge-candidate persistence based on this decision. */
export function decideResolution(name: string, candidates: SimilarityCandidate[], thresholds: ResolutionThresholds = DEFAULT_RESOLUTION_THRESHOLDS): ResolutionDecision {
  let best: SimilarityCandidate | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const score = nameSimilarity(name, candidate.name)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  if (!best) return { decision: "distinct", bestMatch: null, confidence: 0 }
  if (bestScore >= thresholds.autoMerge) return { decision: "auto_merge", bestMatch: best, confidence: bestScore }
  if (bestScore >= thresholds.review) return { decision: "review_candidate", bestMatch: best, confidence: bestScore }
  return { decision: "distinct", bestMatch: null, confidence: bestScore }
}

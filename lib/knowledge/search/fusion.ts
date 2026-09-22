/* ================================================================== *
 * FUSION — combining two rankings that do not share a scale.
 *
 * ts_rank returns a small float shaped by term frequency; cosine
 * distance returns [0,2] shaped by geometry. They are not
 * commensurable, and normalising them (min-max, z-score) makes the
 * combined score depend on the spread of whatever happened to be
 * retrieved — a query whose lexical hits are all mediocre would see
 * its best mediocre hit promoted to 1.0.
 *
 * Reciprocal Rank Fusion sidesteps that by discarding the scores and
 * keeping only the positions: a document's contribution from a list
 * is 1/(k + rank). Nothing needs calibrating, adding a third
 * retriever later changes no constants, and a document ranked well by
 * both retrievers beats one ranked brilliantly by a single retriever
 * — which is exactly the behaviour hybrid retrieval is for.
 *
 * Pure and dependency-free, so every property below is testable
 * without a database or a provider.
 * ================================================================== */

/** The standard RRF constant. Its job is to flatten the top of the
 *  curve so rank 1 does not dominate rank 2 — with k=60, the gap
 *  between ranks 1 and 2 is small and the tail decays gently. */
export const RRF_K = 60

export interface RankedId {
  id: string
}

export interface FusedResult {
  id: string
  score: number
  /** 0-based position in each list that contributed, for debugging a
   *  ranking without re-running the query. */
  ranks: { lexical?: number; semantic?: number }
}

/**
 * Fuses two ranked lists by reciprocal rank.
 *
 * Order within each input list is the ranking — index 0 is best. Ids
 * appearing in both lists accumulate from both, which is what makes
 * agreement between retrievers the strongest signal available.
 *
 * Deterministic: ties break on id, so the same inputs always produce
 * the same order regardless of Map iteration or sort stability.
 */
export function reciprocalRankFusion(
  lexical: readonly RankedId[],
  semantic: readonly RankedId[],
  k: number = RRF_K,
): FusedResult[] {
  const byId = new Map<string, FusedResult>()

  const absorb = (list: readonly RankedId[], key: "lexical" | "semantic") => {
    list.forEach((entry, index) => {
      const existing = byId.get(entry.id) ?? { id: entry.id, score: 0, ranks: {} }
      existing.score += 1 / (k + index + 1)
      existing.ranks[key] = index
      byId.set(entry.id, existing)
    })
  }

  absorb(lexical, "lexical")
  absorb(semantic, "semantic")

  return [...byId.values()].sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

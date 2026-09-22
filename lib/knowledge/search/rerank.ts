import "server-only"

/* ================================================================== *
 * RERANKING — an abstraction first, a heuristic second.
 *
 * The point of this file is the seam. A cross-encoder or a provider
 * reranker is a better ranker than anything here, and when one is
 * worth its latency it should drop in without retrieval or context
 * assembly changing at all. So the interface comes first and the
 * implementation is explicitly replaceable.
 *
 * WHAT THE INITIAL IMPLEMENTATION ACTUALLY FIXES. Fusion ranks
 * passages, not documents, and a long article that matches well
 * contributes several adjacent passages that all match well. Left
 * alone, the top five are routinely five chunks of one piece — and
 * an answer built from that cites one source and calls it a synthesis
 * of a library. Maximal Marginal Relevance is the standard remedy:
 * pick the best candidate, then repeatedly pick the one that is both
 * relevant AND unlike what is already picked.
 *
 * That is a real ranking improvement rather than a placeholder, and
 * it costs no model call — which matters because this runs on every
 * question.
 * ================================================================== */

import type { RetrievedChunk } from "./types"

export interface RerankOptions {
  topK: number
  /** 1 = pure relevance (MMR off), 0 = pure diversity. 0.7 keeps
   *  relevance dominant while still refusing near-duplicates; the
   *  value is a starting point to be tuned against real answers, not
   *  a constant anyone has measured yet. */
  lambda?: number
}

export interface RerankingProvider {
  readonly id: string
  rerank(query: string, chunks: readonly RetrievedChunk[], options: RerankOptions): Promise<RetrievedChunk[]>
}

const DEFAULT_LAMBDA = 0.7

/** Lowercased word set. Deliberately not stemmed: this measures
 *  redundancy between two passages, and for that exact repetition is
 *  the signal — two chunks sharing "failures" and "failure" are
 *  already similar enough by every other shared word. */
function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/\p{L}[\p{L}\p{N}]{2,}/gu) ?? [])
}

/** Jaccard overlap. Cheap, symmetric, bounded [0,1], and needs no
 *  vectors — chunks arrive from retrieval without their embeddings,
 *  and re-fetching them to rerank would cost a query per question. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  return shared / (a.size + b.size - shared)
}

/**
 * Maximal Marginal Relevance over the fused candidates.
 *
 * Relevance is taken from the score retrieval already produced,
 * normalised within this candidate set so lambda means the same thing
 * regardless of whether the scores are RRF sums or cosine
 * similarities. Redundancy is measured against what has ALREADY been
 * selected, which is what makes the second chunk of a well-matching
 * article compete against the first chunk of a different one.
 *
 * Deterministic: ties break on chunkId, so the same candidates always
 * produce the same order.
 */
export function createMmrReranker(): RerankingProvider {
  return {
    id: "mmr",
    async rerank(_query, chunks, options) {
      const lambda = options.lambda ?? DEFAULT_LAMBDA
      const topK = Math.max(1, options.topK)
      if (chunks.length <= 1) return [...chunks]

      const max = Math.max(...chunks.map((c) => c.score))
      // Scale by the best score, NOT by min-max. Min-max looks more
      // principled and is wrong here: it stretches whatever spread the
      // candidates happen to have across the whole [0,1] range, so the
      // last candidate is pinned at relevance 0 and five passages
      // scoring 0.99 down to 0.95 come out looking as far apart as
      // 1.0 and 0.0. Diversity is bounded by (1 - lambda) = 0.3 and
      // could then never outweigh that manufactured gap — MMR would
      // be decorative. Dividing by the max preserves the real ratios,
      // which is what makes diversity decide between comparably
      // relevant passages and stay out of the way otherwise. Every
      // score reaching here is non-negative (ts_rank, cosine
      // similarity, RRF sums); a non-positive max means the scores
      // carry no information, so relevance goes flat and diversity
      // alone ranks.
      const relevance = (c: RetrievedChunk) => (max <= 0 ? 1 : c.score / max)

      const remaining = [...chunks].sort((a, b) => b.score - a.score || (a.chunkId < b.chunkId ? -1 : 1))
      const tokenCache = new Map(remaining.map((c) => [c.chunkId, tokens(c.snippet)]))
      const selected: RetrievedChunk[] = []

      while (selected.length < topK && remaining.length > 0) {
        let bestIndex = 0
        let bestValue = -Infinity
        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i]
          const candidateTokens = tokenCache.get(candidate.chunkId)!
          let redundancy = 0
          for (const chosen of selected) {
            const s = similarity(candidateTokens, tokenCache.get(chosen.chunkId)!)
            if (s > redundancy) redundancy = s
          }
          const value = lambda * relevance(candidate) - (1 - lambda) * redundancy
          if (value > bestValue) {
            bestValue = value
            bestIndex = i
          }
        }
        selected.push(remaining.splice(bestIndex, 1)[0])
      }

      return selected
    },
  }
}

/** The application's reranker. One resolution point, so swapping in a
 *  cross-encoder later is a change here and nowhere else. */
export function resolveReranker(): RerankingProvider {
  return createMmrReranker()
}

export async function rerankKnowledge(
  query: string,
  chunks: readonly RetrievedChunk[],
  options: RerankOptions,
  provider: RerankingProvider = resolveReranker(),
): Promise<RetrievedChunk[]> {
  return provider.rerank(query, chunks, options)
}

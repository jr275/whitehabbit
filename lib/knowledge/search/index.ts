import "server-only"

/* ================================================================== *
 * searchKnowledge — the one entry point.
 *
 * Retrieval logic lives here rather than inside an API route so that
 * the route, the agent-facing service, and any future caller all get
 * the same authorization, the same fusion and the same degradation
 * behaviour. A route that assembled its own retrieval would be a
 * second implementation of the security model.
 * ================================================================== */

import {
  EmbeddingNotConfiguredError,
  resolveEmbeddingProvider,
  type EmbeddingProvider,
  type SemanticSearchStatus,
} from "@/lib/ai/embeddings"
import { logger } from "@/lib/observability/logger"
import { reciprocalRankFusion } from "./fusion"
import { rerankKnowledge, type RerankingProvider } from "./rerank"
import { lexicalSearch, semanticSearch } from "./retrievers"
import type { RetrievedChunk, SearchInput, SearchResult } from "./types"

export * from "./types"
export { reciprocalRankFusion, RRF_K } from "./fusion"
export { assembleKnowledgeContext, DEFAULT_CONTEXT_TOKENS } from "./context"
export type { AssembledContext, AssembledPassage, AssembleContextInput } from "./context"
export { buildExcerpt, citationMarker, extractCitationIds } from "./citations"
export type { KnowledgeCitation } from "./citations"
export { createMmrReranker, rerankKnowledge, resolveReranker } from "./rerank"
export type { RerankingProvider, RerankOptions } from "./rerank"

export const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

/** Each retriever fetches more than the caller asked for, because
 *  fusion only has something to work with if the lists overlap — and
 *  because pgvector filters ownership after the index picks
 *  neighbours, so over-fetching is what buys back the recall that
 *  post-filtering costs. */
const OVERFETCH = 3

export interface SearchDeps {
  /** Test seam. Production resolves the configured provider. */
  embeddings?: EmbeddingProvider
  /** Test seam, and the swap point for a cross-encoder later. */
  reranker?: RerankingProvider
}

export async function searchKnowledge(input: SearchInput, deps: SearchDeps = {}): Promise<SearchResult> {
  const startedAt = Date.now()
  const mode = input.mode ?? "hybrid"
  const limit = Math.min(Math.max(1, input.limit ?? DEFAULT_LIMIT), MAX_LIMIT)
  const q = input.query.trim()

  const truncate = async (candidates: RetrievedChunk[], take: number) =>
    input.rerank
      ? rerankKnowledge(q, candidates, { topK: take }, deps.reranker)
      : candidates.slice(0, take)

  const empty = (): SearchResult => ({
    chunks: [],
    mode,
    executed: { lexical: false, semantic: false },
    semanticSearch: { enabled: false, reason: "not_requested" },
    timings: { totalMs: Date.now() - startedAt },
    candidates: { lexical: 0, semantic: 0 },
  })

  // An empty query is a cheap, valid no-op — not an error and not the
  // whole library. Matching the existing /api/knowledge/search
  // behaviour, which returns nothing below two characters.
  if (q.length < 2) return empty()

  const fetchCount = limit * OVERFETCH
  let lexical: RetrievedChunk[] = []
  let semantic: RetrievedChunk[] = []
  let lexicalMs: number | undefined
  let semanticMs: number | undefined
  let embedMs: number | undefined
  let ranSemantic = false
  // Defaults to "the caller did not ask for it", which is the honest
  // answer for mode: "lexical" and is overwritten below otherwise.
  let semanticStatus: SemanticSearchStatus = { enabled: false, reason: "not_requested" }

  const wantsLexical = mode === "lexical" || mode === "hybrid"
  const wantsSemantic = mode === "semantic" || mode === "hybrid"

  if (wantsLexical) {
    const t = Date.now()
    lexical = await lexicalSearch(q, input.scope, fetchCount, input.filters)
    lexicalMs = Date.now() - t
  }

  if (wantsSemantic) {
    const provider = deps.embeddings ?? resolveEmbeddingProvider()
    if (!provider.isConfigured()) {
      // A deployment task, not an incident. Distinguishing the two is
      // the whole point of reporting a reason rather than a boolean.
      semanticStatus = { enabled: false, reason: "provider_not_configured" }
    } else {
      try {
        const t0 = Date.now()
        const vector = await provider.embedQuery(q)
        embedMs = Date.now() - t0
        const t1 = Date.now()
        semantic = await semanticSearch(vector.values, input.scope, fetchCount, input.filters)
        semanticMs = Date.now() - t1
        ranSemantic = true
        semanticStatus = { enabled: true }
      } catch (err) {
        // Semantic retrieval is an enhancement, not a precondition. A
        // provider outage must degrade search to lexical rather than
        // fail it — but `executed` reports what really ran, so a
        // caller can tell the difference and a silently degraded
        // system does not look healthy.
        semanticStatus = {
          enabled: false,
          reason: err instanceof EmbeddingNotConfiguredError ? "provider_not_configured" : "provider_error",
        }
        if (!(err instanceof EmbeddingNotConfiguredError)) {
          // The detail stays here. It can carry a provider message,
          // and the status above travels to the browser.
          logger.warn("knowledge_semantic_unavailable", {
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  // One retriever: its own order is already the ranking, and running
  // it through fusion would only relabel the scores.
  if (!wantsSemantic || !ranSemantic || !wantsLexical) {
    const single = wantsLexical ? lexical : semantic
    return {
      chunks: await truncate(single, limit),
      mode,
      executed: { lexical: wantsLexical, semantic: ranSemantic },
      semanticSearch: semanticStatus,
      timings: { lexicalMs, semanticMs, embedMs, totalMs: Date.now() - startedAt },
      candidates: { lexical: lexical.length, semantic: semantic.length },
    }
  }

  // Merge the two retrievers' signals rather than keeping whichever
  // row arrived first. A chunk found by both is the strongest case
  // there is, and dropping half its provenance would make it look
  // like a semantic-only guess to anything downstream that has to
  // decide whether it counts as evidence.
  const byId = new Map<string, RetrievedChunk>()
  for (const c of [...lexical, ...semantic]) {
    const existing = byId.get(c.chunkId)
    if (existing) existing.signals = { ...existing.signals, ...c.signals }
    else byId.set(c.chunkId, { ...c, signals: { ...c.signals } })
  }

  const fused = reciprocalRankFusion(
    lexical.map((c) => ({ id: c.chunkId })),
    semantic.map((c) => ({ id: c.chunkId })),
  )

  // Rescore before truncating: a caller comparing a ts_rank against a
  // cosine similarity would be comparing two different things that
  // happen to be numbers. Reranking, when on, therefore sees fused
  // scores for every candidate rather than the top `limit` only —
  // which is the whole point, since the chunk it should promote is
  // usually the one ranked just below the cut.
  const fusedChunks = fused.map((f) => ({ ...byId.get(f.id)!, score: f.score }))
  const chunks = await truncate(fusedChunks, limit)

  return {
    chunks,
    mode,
    executed: { lexical: true, semantic: true },
    semanticSearch: semanticStatus,
    timings: { lexicalMs, semanticMs, embedMs, totalMs: Date.now() - startedAt },
    candidates: { lexical: lexical.length, semantic: semantic.length },
  }
}

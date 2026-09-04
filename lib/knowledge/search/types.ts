/* ================================================================== *
 * RETRIEVAL CONTRACT — what every mode returns, and what nothing
 * outside this directory is allowed to see.
 *
 * No provider shapes cross this boundary. A caller receives ranked
 * chunks with the metadata needed to cite them, and cannot tell
 * whether they came from a GIN index, a vector index, or both.
 * ================================================================== */

/** lexical  — exact word matching, no stemming (see migration 0009)
 *  semantic — nearest neighbours in embedding space
 *  hybrid   — both, fused. The default: each covers the other's
 *             blind spot, exact terms and paraphrase respectively. */
export type RetrievalMode = "lexical" | "semantic" | "hybrid"

/** Tenancy, always taken from the verified session and never from a
 *  request body. Both fields are required — the type is what stops a
 *  future caller from "temporarily" omitting the user. */
export interface AccessScope {
  orgId: string
  userId: string | null
}

export interface SearchInput {
  query: string
  scope: AccessScope
  mode?: RetrievalMode
  limit?: number
  filters?: SearchFilters
}

export interface SearchFilters {
  /** Restrict to specific saved items. */
  itemIds?: string[]
  /** Archived content is excluded unless asked for explicitly. */
  includeArchived?: boolean
}

/** One retrieved passage, with everything a citation needs. */
export interface RetrievedChunk {
  knowledgeItemId: string
  chunkId: string
  /** Fused, comparable within one result set. Not a probability, and
   *  not comparable across queries — see fusion.ts. */
  score: number
  title: string | null
  source: string | null
  snippet: string
  ordinal: number
  charStart: number | null
  charEnd: number | null
  metadata: {
    domain: string | null
    url: string
    lang: string | null
    publishedAt: number | null
  }
}

export interface SearchResult {
  chunks: RetrievedChunk[]
  mode: RetrievalMode
  /** What actually ran. Semantic silently degrades to lexical when no
   *  embedding provider is configured, and the caller has to be able
   *  to tell — a result set that looks the same but was produced a
   *  different way is how a broken provider goes unnoticed. */
  executed: { lexical: boolean; semantic: boolean }
  timings: { lexicalMs?: number; semanticMs?: number; embedMs?: number; totalMs: number }
  candidates: { lexical: number; semantic: number }
}

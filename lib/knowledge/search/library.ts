import "server-only"

/* ================================================================== *
 * LIBRARY SEARCH — the two retrievers the product already had, finally
 * asked the same question at the same time.
 *
 * The semantic engine (./index.ts) has existed since the retrieval
 * work landed and was reachable from exactly one place: Ask. The
 * Library's own search box, and the command palette behind ⌘K, ran a
 * parameterised ILIKE over item rows and nothing else — so a person
 * searching "how do agents remember things" got nothing unless those
 * words appeared verbatim, while asking the same thing in Ask
 * retrieved the passage immediately.
 *
 * THIS ADDS NO RETRIEVER AND NO RANKING ALGORITHM. Both halves exist;
 * so does the fusion. What was missing was a caller.
 *
 *   repo.searchItems   → item-level lexical: titles, author, domain,
 *                        excerpt, tags — the things a CHUNK does not
 *                        carry and semantic search therefore cannot see
 *   searchKnowledge    → passage-level semantic: what the text means,
 *     (mode: semantic)   for the words the person did not use
 *   reciprocalRankFusion → the same RRF, one level up
 *
 * WHY SEMANTIC-ONLY FROM THE CHUNK ENGINE. Its hybrid mode already
 * fuses a chunk-level lexical retriever internally. Asking for hybrid
 * here and then fusing again with the item-level lexical list would
 * count lexical evidence twice and quietly tilt every ranking toward
 * verbatim matches — the opposite of the reason this exists.
 *
 * THE VECTOR IS NEVER AUTHORIZATION. Semantic retrieval returns chunks,
 * and a chunk names its item. That name is a pointer: every id is
 * re-read through getItemsByIds under the caller's own scope before it
 * becomes a result. Two independently-scoped reads, and the second one
 * decides.
 *
 * FAILS OPEN, like the rest of semantic search. With no embedding
 * credential the semantic list is empty and the fusion degrades to the
 * lexical ranking — which is exactly what the Library did before.
 * ================================================================== */

import { buildExcerpt } from "./citations"
import { reciprocalRankFusion } from "./fusion"
import { searchKnowledge, type SearchDeps } from "./index"
import type { RetrievedChunk, SemanticSearchStatus } from "./types"
import * as repo from "@/lib/knowledge/repo"
import type { KnowledgeRow } from "@/lib/knowledge/repo"
import type { SearchEvidence } from "@/lib/knowledge/types"

/** Each retriever is asked for more than the page needs, so fusion has
 *  something to disagree about. Three times is enough for the top of
 *  two lists to interleave without reading a large slice of a library
 *  to render twenty rows. */
const OVERFETCH = 3
export const DEFAULT_SEARCH_LIMIT = 20
export const MAX_SEARCH_LIMIT = 50
/** Far past any real library, and finite so a URL cannot ask the
 *  database to skip a billion rows. */
export const MAX_SEARCH_OFFSET = 10_000

/**
 * A bounded integer from a URL parameter, or the fallback.
 *
 * ABSENT IS NOT ZERO, and getting that wrong is quiet rather than
 * loud: `Number(null)` is 0, so a "clamp it to something sane"
 * implementation that starts with Number() turns a MISSING limit into
 * a limit of zero and then into one result per query — every search
 * returning exactly one answer, with a total beside it saying there
 * were more. That is the bug this function exists to have fixed, which
 * is why it is exported and tested rather than a helper inside a route
 * no test can import.
 */
export function boundedParam(raw: string | null | undefined, fallback: number, max: number): number {
  if (raw === null || raw === undefined) return fallback
  // Plain decimal digits only. Number() would also accept "0x10" as 16
  // and " 7 " as 7 — harmless here because the result is bounded, but a
  // parameter that quietly means something other than it reads is how a
  // limit ends up being a number nobody typed.
  if (!/^\d+$/.test(raw.trim())) return fallback
  const n = Number(raw.trim())
  if (!Number.isSafeInteger(n)) return fallback
  return Math.min(n, max)
}

export interface LibrarySearchOptions {
  limit?: number
  offset?: number
  deps?: SearchDeps
}

/** How similar a passage must be before the surface will point at it
 *  and say "this is why".
 *
 *  Semantic retrieval returns NEAREST neighbours, not GOOD ones: in a
 *  small library the nearest passage to any query is whatever exists,
 *  at any distance. Ranking can live with that — a weak match simply
 *  ranks low. A claim cannot: showing an unrelated paragraph under
 *  "matched in your library" is worse than showing nothing, because
 *  the reader believes it.
 *
 *  This gates the CLAIM, never the ranking. An item below the floor
 *  still appears exactly where fusion put it; it just arrives without
 *  an explanation, which is the honest state. The number is a product
 *  judgement — deliberately conservative, and one constant to change.
 */
export const EVIDENCE_MIN_SIMILARITY = 0.5

/** One result: the row, and the passage that produced it if there was
 *  one. Evidence is absent for an item the lexical retriever found by
 *  its title, author or tags — there is no passage behind those. */
export interface LibrarySearchHit {
  row: KnowledgeRow
  evidence?: SearchEvidence
}

export interface LibrarySearchResult {
  results: LibrarySearchHit[]
  /** How many candidates each retriever contributed, and whether
   *  semantic ran at all. Reported so a deployment with no embedding
   *  credential is visibly lexical-only rather than silently worse. */
  retrieval: {
    lexical: number
    semantic: number
    semanticSearch: SemanticSearchStatus
  }
  /** Fused candidates before the page was cut, so a caller can tell
   *  "no more results" from "end of this page". */
  total: number
}

/** Turns the chunk that earned an item its semantic rank into displayable
 *  evidence — or into nothing, when it is not similar enough to be worth
 *  claiming. */
function evidenceFor(chunk: RetrievedChunk | undefined): SearchEvidence | undefined {
  if (!chunk) return undefined
  const similarity = chunk.signals.semantic
  if (similarity === undefined || similarity < EVIDENCE_MIN_SIMILARITY) return undefined
  return {
    snippet: buildExcerpt(chunk.snippet),
    chunkId: chunk.chunkId,
    ordinal: chunk.ordinal,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    similarity,
  }
}

export async function searchLibrary(
  query: string,
  scope: { orgId: string; userId: string | null },
  options: LibrarySearchOptions = {},
): Promise<LibrarySearchResult> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_SEARCH_LIMIT), MAX_SEARCH_LIMIT)
  const offset = Math.max(0, options.offset ?? 0)
  const q = query.trim()

  // Matches the route's long-standing behaviour and searchKnowledge's:
  // a one-character query is a cheap no-op, not an error and not the
  // whole library.
  if (q.length < 2) {
    return {
      results: [],
      retrieval: { lexical: 0, semantic: 0, semanticSearch: { enabled: false, reason: "not_requested" } },
      total: 0,
    }
  }

  const fetchCount = (offset + limit) * OVERFETCH

  const [lexicalRows, semantic] = await Promise.all([
    repo.searchItems(scope.orgId, scope.userId, q, fetchCount),
    searchKnowledge(
      { query: q, scope, mode: "semantic", limit: fetchCount, filters: { includeArchived: false } },
      options.deps ?? {},
    ),
  ])

  // Chunks collapse to their items, keeping the best rank each item
  // achieved: an item whose third passage also matched is not a better
  // result than one whose first did. The chunk that earned that rank is
  // kept alongside — it is the evidence, and it is already in hand, so
  // producing it costs nothing extra.
  const semanticIds: { id: string }[] = []
  const bestChunk = new Map<string, (typeof semantic.chunks)[number]>()
  for (const chunk of semantic.chunks) {
    if (bestChunk.has(chunk.knowledgeItemId)) continue
    bestChunk.set(chunk.knowledgeItemId, chunk)
    semanticIds.push({ id: chunk.knowledgeItemId })
  }

  const fused = reciprocalRankFusion(
    lexicalRows.map((r) => ({ id: r.id })),
    semanticIds,
  )

  const pageIds = fused.slice(offset, offset + limit).map((f) => f.id)

  // THE SECOND, DECIDING READ. Ids from either retriever are re-read
  // under this caller's scope; anything that does not come back is not
  // a result, whatever produced the id.
  const rows = await repo.getItemsByIds(pageIds, scope.orgId, scope.userId)
  const byId = new Map(rows.map((r) => [r.id, r]))

  return {
    // Fused order, and only rows the scoped re-read returned. Evidence
    // is attached AFTER that read, so a passage can never carry an item
    // into the results — the row has to survive authorization first,
    // and only then does its chunk get to explain it.
    results: pageIds.flatMap<LibrarySearchHit>((id) => {
      const row = byId.get(id)
      if (!row) return []
      const evidence = evidenceFor(bestChunk.get(id))
      return [evidence ? { row, evidence } : { row }]
    }),
    retrieval: {
      lexical: lexicalRows.length,
      semantic: semanticIds.length,
      semanticSearch: semantic.semanticSearch,
    },
    total: fused.length,
  }
}

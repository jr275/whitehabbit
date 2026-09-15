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

import { reciprocalRankFusion } from "./fusion"
import { searchKnowledge, type SearchDeps } from "./index"
import type { SemanticSearchStatus } from "./types"
import * as repo from "@/lib/knowledge/repo"
import type { KnowledgeRow } from "@/lib/knowledge/repo"

/** Each retriever is asked for more than the page needs, so fusion has
 *  something to disagree about. Three times is enough for the top of
 *  two lists to interleave without reading a large slice of a library
 *  to render twenty rows. */
const OVERFETCH = 3
export const DEFAULT_SEARCH_LIMIT = 20
export const MAX_SEARCH_LIMIT = 50

export interface LibrarySearchOptions {
  limit?: number
  offset?: number
  deps?: SearchDeps
}

export interface LibrarySearchResult {
  rows: KnowledgeRow[]
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
      rows: [],
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
  // result than one whose first did.
  const semanticIds: { id: string }[] = []
  const seen = new Set<string>()
  for (const chunk of semantic.chunks) {
    if (seen.has(chunk.knowledgeItemId)) continue
    seen.add(chunk.knowledgeItemId)
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
    // Fused order, and only rows the scoped re-read returned.
    rows: pageIds.map((id) => byId.get(id)).filter((r): r is KnowledgeRow => r !== undefined),
    retrieval: {
      lexical: lexicalRows.length,
      semantic: semanticIds.length,
      semanticSearch: semantic.semanticSearch,
    },
    total: fused.length,
  }
}

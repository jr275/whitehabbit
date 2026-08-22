import "server-only"

/* ================================================================== *
 * KNOWLEDGE RETRIEVER — KnowledgeSource -> relevant context -> Worker
 * Runtime.
 *
 * There is no vector database or embedding model in this deployment,
 * and none is faked here. A KnowledgeSource in this product is real
 * operator-authored reference text (see model.ts) — a source added
 * from Studio has no content until someone actually types or pastes
 * it in. Retrieval is a real, deterministic, provider-independent
 * keyword-overlap score over that real text: honest and simple, not
 * "semantic search" dressed up to look smarter than it is.
 *
 * A source with no `content` contributes nothing — it is real
 * metadata (a catalog entry a person added), not retrievable text, and
 * is never substituted with invented content.
 * ================================================================== */

export interface KnowledgeRef {
  id: string
  name: string
  type: string
  content?: string
}

export interface RetrievedKnowledge {
  id: string
  name: string
  type: string
  snippet: string
  score: number
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

/** Real overlap between the query's real terms and the source's real
 * text — no invented weighting, no fabricated "confidence". */
function overlapScore(queryTerms: Set<string>, content: string): number {
  const contentTerms = new Set(tokenize(content))
  if (contentTerms.size === 0) return 0
  let hits = 0
  for (const t of queryTerms) if (contentTerms.has(t)) hits++
  return queryTerms.size === 0 ? 0 : hits / queryTerms.size
}

export function retrieveRelevantKnowledge(sources: KnowledgeRef[], query: string, limit = 3): RetrievedKnowledge[] {
  const queryTerms = new Set(tokenize(query))
  const withContent = sources.filter((s): s is KnowledgeRef & { content: string } => !!s.content?.trim())
  if (withContent.length === 0 || queryTerms.size === 0) return []

  return withContent
    .map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      snippet: s.content.length > 600 ? `${s.content.slice(0, 600)}…` : s.content,
      score: overlapScore(queryTerms, s.content),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

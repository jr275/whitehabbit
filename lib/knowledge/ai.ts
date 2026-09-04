/* ================================================================== *
 * KNOWLEDGE AI — the typed CONTRACT and client boundary for "Ask your
 * knowledge". This is the ONLY place the /knowledge/ai UI talks to the
 * network. The retrieval-augmented backend (extraction → chunks →
 * embeddings → hybrid retrieval → reranking → grounded answer) is being
 * built separately; the UI is written entirely against these types so it
 * renders whatever the REAL API returns and never fabricates answers,
 * citations, scores, or confidence.
 * ================================================================== */

export type KnowledgeConfidence = "high" | "medium" | "low"

export interface KnowledgeAIRequest {
  query: string
}

/** One retrieved piece of evidence backing the answer. Optional fields
 *  are rendered only when the backend actually provides them. */
export interface KnowledgeCitation {
  /** Stable marker id, e.g. "1" — what an inline [1] in the answer refers to. */
  citationId: string
  /** The saved item this evidence came from → links into the reader. */
  knowledgeItemId: string
  /** The specific extracted chunk, when the backend surfaces chunk-level detail. */
  chunkId?: string
  title: string
  sourceUrl?: string
  excerpt?: string
  /** 0–1 relevance from the retriever. Never invented — shown only if present. */
  relevanceScore?: number
}

export interface KnowledgeAIResponse {
  answer: string
  citations: KnowledgeCitation[]
  confidence?: KnowledgeConfidence
  retrieval?: {
    results: number
  }
  /** The backend explicitly telling us it could not ground an answer. */
  insufficientEvidence?: boolean
  /** Optional, backend-generated follow-up questions. Rendered only when
   *  the API returns them — the UI never hardcodes fake follow-ups. */
  followUps?: string[]
}

/** Raised for HTTP 501/503 — the intelligence layer isn't wired up yet.
 *  Distinct from a transient failure so the UI shows a calm, honest
 *  "not connected yet" state instead of a "try again" error. */
export class KnowledgeAiUnavailableError extends Error {
  constructor(message = "Ask your knowledge isn’t connected yet.") {
    super(message)
    this.name = "KnowledgeAiUnavailableError"
  }
}

/** Any other non-OK response (network, 400, 500) — a real, transient
 *  failure the user can retry. */
export class KnowledgeAiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "KnowledgeAiRequestError"
  }
}

/**
 * Ask a grounded question over the user's own saved knowledge.
 *
 * Talks to POST /api/knowledge/ai and returns the real KnowledgeAIResponse.
 * There is deliberately NO local/guest fallback: unlike list/search, a
 * grounded RAG answer cannot be synthesized in the browser, so when the
 * backend is unavailable we surface that honestly rather than faking it.
 */
export async function askKnowledge(query: string, signal?: AbortSignal): Promise<KnowledgeAIResponse> {
  const res = await fetch("/api/knowledge/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query } satisfies KnowledgeAIRequest),
    signal,
  })

  const data = (await res.json().catch(() => null)) as (KnowledgeAIResponse & { error?: string }) | null

  if (!res.ok) {
    // 501 = not implemented yet, 503 = configured-but-unavailable. Both mean
    // "the engine isn't answering right now" — a distinct, honest state.
    if (res.status === 501 || res.status === 503) {
      throw new KnowledgeAiUnavailableError(data?.error || undefined)
    }
    throw new KnowledgeAiRequestError(
      data?.error || "Something went wrong while searching your knowledge.",
      res.status,
    )
  }

  return data as KnowledgeAIResponse
}

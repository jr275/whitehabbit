import "server-only"

/* POST /api/knowledge/ai — the HONEST API BOUNDARY for "Ask your
 * knowledge".
 *
 * The retrieval-augmented backend (extraction → chunks → embeddings →
 * hybrid retrieval → reranking → grounded answer with citations) is being
 * built separately. Until it exists, this endpoint validates the request
 * shape and returns HTTP 501 so the UI can show a truthful "not connected
 * yet" state — never a fabricated answer, citation, score, or confidence.
 *
 * When the RAG engine lands it REPLACES this handler, returning a
 * KnowledgeAIResponse (see lib/knowledge/ai.ts). The typed client and the
 * entire /knowledge/ai UI are already written against that contract, so no
 * frontend changes will be required.
 *
 * Deliberately NO AI logic, NO database access, and NO fabricated data. */

import { NextResponse } from "next/server"

export async function POST(req: Request) {
  let query = ""
  try {
    const body = (await req.json()) as { query?: unknown }
    if (typeof body?.query === "string") query = body.query.trim()
  } catch {
    // Malformed JSON falls through to the validation below.
  }

  if (!query) {
    return NextResponse.json({ error: "A question is required.", code: "invalid_request" }, { status: 400 })
  }

  return NextResponse.json(
    {
      error: "Ask your knowledge isn’t connected yet. The retrieval engine is being built.",
      code: "not_implemented",
    },
    { status: 501 },
  )
}

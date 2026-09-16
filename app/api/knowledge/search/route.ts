import "server-only"

/* GET /api/knowledge/search?q=…&limit=…&offset=…
 *
 * Search over the CALLING USER's own saved items, now through BOTH
 * retrievers the product has: item-level lexical (title, source,
 * author, excerpt, extracted text, tags) and passage-level semantic,
 * fused by the same reciprocal rank fusion the answering pipeline
 * uses. See lib/knowledge/search/library.ts for why it is fused rather
 * than concatenated, and why the chunk engine is asked for semantic
 * only.
 *
 * Fails open: with no embedding credential the semantic list is empty
 * and results are the lexical ranking, exactly as before.
 *
 * Org and user context come only from requireSession(); the browser
 * never supplies either, so one org can never search another's
 * library, and (S5) one user can never search a colleague's — search
 * is as owner-scoped as every other read, and an id produced by
 * semantic retrieval is re-read under that scope before it can become
 * a result. Returns the same card-shaped items the Library renders. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { rowToItem } from "@/lib/knowledge/adapter"
import * as repo from "@/lib/knowledge/repo"
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, searchLibrary } from "@/lib/knowledge/search/library"
import type { SearchEvidence } from "@/lib/knowledge/types"
import { requireSession } from "@/lib/session"

/** Parses a bounded integer parameter, ignoring anything that is not
 *  one. A caller cannot widen its own page by asking for a million. */
function positiveInt(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback
  return Math.min(n, max)
}

export async function GET(req: Request) {
  return withApiHandler("knowledge.search", async () => {
    const { organizationId, userId } = await requireSession()
    const params = new URL(req.url).searchParams
    const q = (params.get("q") ?? "").trim()

    // An empty query is a valid, cheap no-op — return nothing rather
    // than the whole library, so the UI can show its idle state.
    if (q.length < 2) return NextResponse.json({ items: [], query: q, total: 0 })

    const limit = Math.max(1, positiveInt(params.get("limit"), DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT))
    const offset = positiveInt(params.get("offset"), 0, 10_000)

    // S5: search never surfaces another user's content, in the same
    // org or not — enforced inside searchLibrary on both retrievers
    // and again on the read that turns an id into a row.
    const { results, retrieval, total } = await searchLibrary(q, { orgId: organizationId, userId }, { limit, offset })
    // One query for every result's tags — see getTagsForItems.
    const ids = results.map((r) => r.row.id)
    const tags = await repo.getTagsForItems(ids, organizationId, userId)
    const items = results.map((r) => rowToItem(r.row, tags.get(r.row.id) ?? []))

    // Evidence keyed by item, separate from the card model: a
    // KnowledgeItem is what the Library renders everywhere, and it does
    // not become query-dependent because one caller happened to search.
    // Items without a matching passage simply have no key here.
    const evidence: Record<string, SearchEvidence> = {}
    for (const r of results) if (r.evidence) evidence[r.row.id] = r.evidence

    return NextResponse.json({ items, evidence, query: q, total, retrieval })
  })
}

import "server-only"

/* GET /api/knowledge/search?q=…  — real search over the CALLING USER's
 * own saved items (title, source, excerpt, extracted body text, tags).
 * Org and user context come only from requireSession(); the browser
 * never supplies either, so one org can never search another's
 * library, and (S5) one user can never search a colleague's — search
 * is as owner-scoped as every other read. Returns the same card-shaped
 * items the Library renders. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { rowToItem } from "@/lib/knowledge/adapter"
import * as repo from "@/lib/knowledge/repo"
import { requireSession } from "@/lib/session"

const MAX_RESULTS = 20

export async function GET(req: Request) {
  return withApiHandler("knowledge.search", async () => {
    const { organizationId, userId } = await requireSession()
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim()

    // An empty query is a valid, cheap no-op — return nothing rather
    // than the whole library, so the UI can show its idle state.
    if (q.length < 2) return NextResponse.json({ items: [], query: q })

    // S5: search never surfaces another user's content, in the same
    // org or not.
    const rows = await repo.searchItems(organizationId, userId, q, MAX_RESULTS)
    // One query for every result's tags — see getTagsForItems.
    const tags = await repo.getTagsForItems(rows.map((r) => r.id), organizationId, userId)
    const items = rows.map((row) => rowToItem(row, tags.get(row.id) ?? []))
    return NextResponse.json({ items, query: q })
  })
}

import "server-only"

/* GET /api/knowledge/search?q=…  — real search over the authenticated
 * org's saved items (title, source, excerpt, extracted body text, tags).
 * Org context comes only from requireSession(); the browser never
 * supplies an organization id, so one org can never search another's
 * library. Returns the same card-shaped items the Library renders. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { rowToItem } from "@/lib/knowledge/adapter"
import * as repo from "@/lib/knowledge/repo"
import { requireSession } from "@/lib/session"

const MAX_RESULTS = 20

export async function GET(req: Request) {
  return withApiHandler("knowledge.search", async () => {
    const { organizationId } = await requireSession()
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim()

    // An empty query is a valid, cheap no-op — return nothing rather
    // than the whole library, so the UI can show its idle state.
    if (q.length < 2) return NextResponse.json({ items: [], query: q })

    const rows = await repo.searchItems(organizationId, q, MAX_RESULTS)
    const items = await Promise.all(rows.map(async (row) => rowToItem(row, await repo.getTags(row.id, organizationId))))
    return NextResponse.json({ items, query: q })
  })
}

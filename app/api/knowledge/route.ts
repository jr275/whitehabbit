import "server-only"

/* GET  /api/knowledge  — list the authenticated org's real saved items
 *                        (paginated, filterable, newest first).
 * POST /api/knowledge  — save a real URL. Creates the row in `saved`
 *                        state, returns it immediately, and schedules
 *                        the SSRF-guarded ingestion pipeline to run
 *                        after the response (via next/server `after`).
 *
 * Org context comes only from requireSession(); the browser never
 * supplies an organization id. */

import { after, NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { rowToItem } from "@/lib/knowledge/adapter"
import * as repo from "@/lib/knowledge/repo"
import { processItem, saveUrl, SaveValidationError } from "@/lib/knowledge/service"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

const PAGE_SIZE = 24
const FILTERS = new Set(["all", "unread", "read", "favorites", "recent"])
const KINDS = new Set(["article", "video", "pdf", "podcast", "social", "document"])

export async function GET(req: Request) {
  return withApiHandler("knowledge.list", async () => {
    const { organizationId, userId } = await requireSession()
    const { searchParams } = new URL(req.url)

    const rawLimit = Number(searchParams.get("limit"))
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 60) : PAGE_SIZE
    const rawOffset = Number(searchParams.get("offset"))
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0
    const filterParam = searchParams.get("filter")
    const filter = (filterParam && FILTERS.has(filterParam) ? filterParam : "all") as repo.ListOptions["filter"]
    const kindParam = searchParams.get("kind")
    const kind = kindParam && KINDS.has(kindParam) ? kindParam : null

    // S5: the library is private per user — never the whole org's.
    const { rows, total } = await repo.listItems(organizationId, userId, { limit, offset, filter, kind })
    // Fetch tags per row in parallel — small N (page size), each a
    // single indexed query.
    const items = await Promise.all(
      rows.map(async (row) => rowToItem(row, await repo.getTags(row.id, organizationId, userId))),
    )

    const nextOffset = offset + rows.length
    return NextResponse.json({
      items,
      total,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
    })
  })
}

export async function POST(req: Request) {
  return withApiHandler("knowledge.save", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("knowledge_save", organizationId)

    const body = (await req.json().catch(() => null)) as { url?: unknown } | null
    if (!body || typeof body.url !== "string") throw new ValidationError("A url string is required.")

    let result
    try {
      result = await saveUrl({ orgId: organizationId, userId, url: body.url })
    } catch (err) {
      if (err instanceof SaveValidationError) throw new ValidationError(err.message)
      throw err
    }

    const { row, duplicate } = result

    // Already in THIS USER's library — return their existing item,
    // don't re-ingest, don't re-audit. The client surfaces "Already in
    // your library".
    if (duplicate) {
      const tags = await repo.getTags(row.id, organizationId, userId)
      return NextResponse.json({ item: rowToItem(row, tags), duplicate: true }, { status: 200 })
    }

    await recordAudit({ orgId: organizationId, userId, action: "knowledge.save", resourceType: "knowledge_item", resourceId: row.id })

    // Run ingestion AFTER the response is flushed — the user sees the
    // new card instantly and polls for real state transitions.
    after(async () => {
      await processItem(row.id, organizationId, userId)
    })

    return NextResponse.json({ item: rowToItem(row, []), duplicate: false }, { status: 201 })
  })
}

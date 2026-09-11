import "server-only"

/* GET /api/knowledge/:id/related — what this item is about, and what
 * else in the library shares those concepts.
 *
 * Read-only, derived entirely from rows the concepts pipeline already
 * wrote. It calls no model and costs nothing, so unlike /summarize it
 * is deliberately not rate-limited.
 *
 * Owner-scoped like every other :id route (S5): the item is resolved
 * with the owner predicate before anything else runs, so another
 * user's item in the same org is a 404 — and the two queries behind
 * discoverForItem are independently scoped as well, so a related item
 * belonging to someone else cannot enter the response even if the ids
 * would otherwise join. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { discoverForItem } from "@/lib/knowledge/concepts/discovery"
import * as repo from "@/lib/knowledge/repo"
import { requireSession } from "@/lib/session"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("knowledge.related", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params

    const row = await repo.getItem(id, organizationId, userId)
    if (!row) throw new NotFoundError()

    const discovery = await discoverForItem(id, { orgId: organizationId, userId })
    return NextResponse.json({ discovery })
  })
}

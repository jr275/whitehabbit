import "server-only"

/* POST /api/pocket2/items/:id/reingest — user-initiated retry for an
 * item whose metadata fetch failed. Never automatic: a server that
 * already answered "no" should not be asked again on a timer. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireTenant } from "@/lib/pocket2/tenancy"
import { reingest } from "@/lib/pocket2/services/save-service"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("pocket2.items.reingest", async () => {
    const ctx = await requireTenant()
    await enforceRateLimit("pocket2_reingest", ctx.orgId)
    const { id } = await params

    const item = await reingest(ctx, id)
    // null means the item is not in this organization — reported as
    // 404, identically to one that does not exist.
    if (!item) throw new NotFoundError()

    return NextResponse.json({ item, queued: true }, { status: 202 })
  })
}

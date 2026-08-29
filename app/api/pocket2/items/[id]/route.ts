import "server-only"

/* GET /api/pocket2/items/:id — one saved item, org-scoped.
 *
 * Used by the save dialog to watch a freshly-saved card fill in as
 * ingestion completes. An item in another organization is reported as
 * 404, identically to one that does not exist. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { requireTenant } from "@/lib/pocket2/tenancy"
import { getSavedItem } from "@/lib/pocket2/services/library-service"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("pocket2.items.get", async () => {
    const ctx = await requireTenant()
    const { id } = await params
    const item = await getSavedItem(ctx, id)
    if (!item) throw new NotFoundError()
    return NextResponse.json({ item })
  })
}

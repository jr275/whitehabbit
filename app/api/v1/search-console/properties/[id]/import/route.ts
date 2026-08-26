import "server-only"

/* POST /api/v1/search-console/properties/:id/import — the honest
 * manual-import path (§12): the caller supplies a real GSC data
 * export (snapshot + query/page observation rows); nothing here
 * fabricates or estimates a number. See lib/intelligence/search-console/
 * live.ts for the real OAuth path, gated behind real credentials. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProperty, importSnapshot, importQueryObservation, importPageObservation } from "@/lib/intelligence/search-console/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

interface ImportBody {
  snapshots?: { date: string; clicks: number; impressions: number; ctr: number; position: number }[]
  queries?: { date: string; query: string; country?: string; device?: string; clicks: number; impressions: number; ctr: number; position: number }[]
  pages?: { date: string; pageUrl: string; clicks: number; impressions: number; ctr: number; position: number }[]
}

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("v1.search-console.import", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const property = await getProperty(id, organizationId)
    if (!property) throw new NotFoundError()

    const body = (await req.json()) as ImportBody
    if (!body.snapshots?.length && !body.queries?.length && !body.pages?.length) {
      throw new ValidationError("At least one of snapshots, queries, or pages must be provided.")
    }

    for (const s of body.snapshots ?? []) await importSnapshot(organizationId, id, s)
    for (const q of body.queries ?? []) await importQueryObservation(organizationId, id, q)
    for (const p of body.pages ?? []) await importPageObservation(organizationId, id, p)

    await recordAudit({
      orgId: organizationId,
      userId,
      action: "search_console.import",
      resourceType: "search_console_property",
      resourceId: id,
      metadata: { snapshots: body.snapshots?.length ?? 0, queries: body.queries?.length ?? 0, pages: body.pages?.length ?? 0 },
    })
    return NextResponse.json({ imported: { snapshots: body.snapshots?.length ?? 0, queries: body.queries?.length ?? 0, pages: body.pages?.length ?? 0 } })
  })
}

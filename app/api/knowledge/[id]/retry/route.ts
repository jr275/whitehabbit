import "server-only"

/* POST /api/knowledge/:id/retry — re-run the ingestion pipeline for an
 * item. Intended for failed items, but also safe for one stuck mid-
 * pipeline. Resets the row to `saved`, responds immediately, and
 * reprocesses after the response — reusing the exact same real
 * pipeline as the original save (no duplicated ingestion logic). */

import { after, NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { rowToItem } from "@/lib/knowledge/adapter"
import * as repo from "@/lib/knowledge/repo"
import { processItem } from "@/lib/knowledge/service"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("knowledge.retry", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("knowledge_retry", organizationId)
    const { id } = await params

    const row = await repo.getItem(id, organizationId)
    if (!row) throw new NotFoundError()

    await repo.setStatus(id, organizationId, "saved", null)
    await recordAudit({ orgId: organizationId, userId, action: "knowledge.retry", resourceType: "knowledge_item", resourceId: id })

    after(async () => {
      await processItem(id, organizationId)
    })

    const fresh = (await repo.getItem(id, organizationId)) ?? row
    return NextResponse.json({ item: rowToItem(fresh, []) })
  })
}

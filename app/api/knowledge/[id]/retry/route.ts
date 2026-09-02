import "server-only"

/* POST /api/knowledge/:id/retry — re-run the ingestion pipeline for an
 * item. Intended for failed items, but also safe for one stuck mid-
 * pipeline. Resets the row to `saved`, enqueues a durable ingestion
 * job (or reuses the already-open one — see enqueueIngestJob's own
 * idempotency guarantee, backed by a real database constraint, not
 * just this route's logic), responds immediately, and attempts an
 * after()-scheduled fast-path claim of that exact job — the same
 * pipeline the original save uses, no duplicated ingestion logic. */

import { after, NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { rowToItem } from "@/lib/knowledge/adapter"
import * as repo from "@/lib/knowledge/repo"
import { claimAndRunJob } from "@/lib/knowledge/service"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("knowledge.retry", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("knowledge_retry", organizationId)
    const { id } = await params

    // S5: owner-scoped — retrying another user's item 404s, same as GET.
    const row = await repo.getItem(id, organizationId, userId)
    if (!row) throw new NotFoundError()

    await repo.setStatus(id, organizationId, userId, "saved", null)
    await recordAudit({ orgId: organizationId, userId, action: "knowledge.retry", resourceType: "knowledge_item", resourceId: id })

    // A double-clicked Retry calls enqueueIngestJob twice — the second
    // call resolves to the SAME open job (uq_knowledge_jobs_item_open
    // is the real, final guard), never a duplicate. Either way this
    // route gets back a real job id to target with the fast-path claim.
    const job = await repo.enqueueIngestJob(id, organizationId, userId)
    after(async () => {
      await claimAndRunJob({ jobId: job.id })
    })

    const fresh = (await repo.getItem(id, organizationId, userId)) ?? row
    return NextResponse.json({ item: rowToItem(fresh, []) })
  })
}

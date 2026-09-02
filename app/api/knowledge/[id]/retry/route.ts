import "server-only"

/* POST /api/knowledge/:id/retry — re-run the ingestion pipeline for an
 * item. Intended for failed items, but also safe for one stuck mid-
 * pipeline.
 *
 * Order matters here, and it's deliberate: the durable job is
 * enqueued FIRST, and the item is only reset to `saved` once that
 * enqueue has actually succeeded. Fixed from an earlier ordering
 * (reset first, enqueue second) that the Commit 12A audit found could
 * leave an item stuck: if enqueueIngestJob failed after the status
 * reset had already committed, the item lost its `failed` state (and
 * with it, the only UI path back to Retry) while gaining no job at
 * all. With the job enqueued first, an enqueue failure changes
 * nothing — the item stays exactly as it was, still `failed`, still
 * retriable, and this request just fails loudly instead of quietly
 * stranding the item. enqueueIngestJob's own idempotency guarantee
 * (backed by a real database constraint, not just this route's logic)
 * means a double-clicked Retry still resolves to one job either way.
 *
 * after() then attempts a fast-path claim of that exact job — the
 * same pipeline the original save uses, no duplicated ingestion logic. */

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

    // Enqueue BEFORE resetting anything — see the header comment. A
    // double-clicked Retry calls this twice; the second call resolves
    // to the SAME open job (uq_knowledge_jobs_item_open is the real,
    // final guard), never a duplicate. If this throws, nothing below
    // it runs: the item's prior state (failed, with its real error
    // and retry button) is untouched.
    const job = await repo.enqueueIngestJob(id, organizationId, userId)

    await repo.setStatus(id, organizationId, userId, "saved", null)
    await recordAudit({ orgId: organizationId, userId, action: "knowledge.retry", resourceType: "knowledge_item", resourceId: id })

    after(async () => {
      await claimAndRunJob({ jobId: job.id })
    })

    const fresh = (await repo.getItem(id, organizationId, userId)) ?? row
    return NextResponse.json({ item: rowToItem(fresh, []) })
  })
}

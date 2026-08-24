import "server-only"

/* GET /api/workers/[id]    — one worker, live tool status hydrated
 * PATCH /api/workers/[id]  — persist a Build-rail configuration edit
 * DELETE /api/workers/[id] — remove a worker
 *
 * Every handler is authenticated and org-scoped: requireSession()
 * derives organizationId from the verified session, never from the
 * URL or the request body, and getWorker/deleteWorker/upsertWorker
 * all filter by it — org A can never read, edit, or delete org B's
 * Worker by id (a mismatch reads as a plain 404, not a 403, so it
 * never confirms another tenant's resource exists at all).
 *
 * PATCH only ever writes the Build-rail CONFIGURATION fields the
 * client can legitimately edit (identity/mission/knowledge/skills/
 * tools/behaviors/channels/outcome/autonomy). status, tested,
 * releasedVersionId and releasedAt are state-machine-owned — set only
 * by /build and /release — and are always taken from the server's
 * current row, never from the request body, so a client can never
 * PATCH a worker straight to "live". */

import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { deleteWorker, getWorker, recordAudit, upsertWorker } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"
import type { Worker } from "@/lib/workforce/model"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("workers.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const worker = await getWorker(id, organizationId)
    if (!worker) throw new NotFoundError()
    return NextResponse.json({ worker: hydrateWorkerLiveState(worker) })
  })
}

const EDITABLE_FIELDS = ["identity", "mission", "objectives", "knowledge", "skills", "tools", "behaviors", "channels", "outcome", "autonomy"] as const

export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler("workers.patch", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const body = (await req.json().catch(() => null)) as { worker?: Partial<Worker> } | null
    if (!body?.worker) throw new ValidationError("Request body must include { worker }.")

    const existing = await getWorker(id, organizationId)
    if (!existing) throw new NotFoundError()

    const merged: Worker = { ...existing }
    for (const field of EDITABLE_FIELDS) {
      if (body.worker[field] !== undefined) (merged as unknown as Record<string, unknown>)[field] = body.worker[field]
    }
    // status/tested/releasedVersionId/releasedAt/id/createdAt intentionally
    // NOT taken from the request body — they stay exactly what the
    // server already had.

    const saved = await upsertWorker(merged, organizationId, userId)
    return NextResponse.json({ worker: hydrateWorkerLiveState(saved) })
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApiHandler("workers.delete", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await getWorker(id, organizationId)
    if (!existing) throw new NotFoundError()
    await deleteWorker(id, organizationId)
    await recordAudit({ orgId: organizationId, userId, action: "worker.delete", resourceType: "worker", resourceId: id })
    return NextResponse.json({ ok: true })
  })
}

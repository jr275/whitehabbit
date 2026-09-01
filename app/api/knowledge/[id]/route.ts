import "server-only"

/* GET    /api/knowledge/:id  — the full reader document (extracted body
 *                              text included). Marks the item read.
 * PATCH  /api/knowledge/:id  — toggle favorite / archived. Body:
 *                              { favorite?: boolean, archived?: boolean }
 * DELETE /api/knowledge/:id  — permanently remove the item.
 *
 * Every handler is org-scoped through requireSession() + the repo's
 * org-filtered queries: another org's item is indistinguishable from a
 * nonexistent one (404), never leaked. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { rowToDocument, rowToItem } from "@/lib/knowledge/adapter"
import * as repo from "@/lib/knowledge/repo"
import { recordAudit } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("knowledge.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params

    const row = await repo.getItem(id, organizationId)
    if (!row) throw new NotFoundError()

    // Reading is a side effect of opening a ready item — set first-open.
    if (row.status === "ready" && !row.read_at) await repo.markRead(id, organizationId)

    const tags = await repo.getTags(id, organizationId)
    return NextResponse.json({ document: rowToDocument({ ...row, read_at: row.read_at ?? String(Date.now()) }, tags) })
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("knowledge.patch", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params

    const body = (await req.json().catch(() => null)) as { favorite?: unknown; archived?: unknown } | null
    if (!body || (body.favorite === undefined && body.archived === undefined)) {
      throw new ValidationError("Provide favorite and/or archived boolean.")
    }

    let row = await repo.getItem(id, organizationId)
    if (!row) throw new NotFoundError()

    if (typeof body.favorite === "boolean") {
      row = (await repo.setFavorite(id, organizationId, body.favorite)) ?? row
    }
    if (typeof body.archived === "boolean") {
      row = (await repo.setArchived(id, organizationId, body.archived)) ?? row
      await recordAudit({ orgId: organizationId, userId, action: body.archived ? "knowledge.archive" : "knowledge.unarchive", resourceType: "knowledge_item", resourceId: id })
    }

    const tags = await repo.getTags(id, organizationId)
    return NextResponse.json({ item: rowToItem(row, tags) })
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("knowledge.delete", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params

    const deleted = await repo.deleteItem(id, organizationId)
    if (!deleted) throw new NotFoundError()
    await recordAudit({ orgId: organizationId, userId, action: "knowledge.delete", resourceType: "knowledge_item", resourceId: id })

    return NextResponse.json({ ok: true })
  })
}

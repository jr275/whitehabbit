import "server-only"

/* GET    /api/knowledge/items/[id] — one item, with content.
 * DELETE /api/knowledge/items/[id] — soft delete.
 *
 * A cross-tenant id returns 404, never 403: another workspace's item
 * must be indistinguishable from one that does not exist. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/platform/errors"
import { requireScope } from "@/lib/knowledge/access/scope"
import { toDetailDto } from "@/lib/knowledge/api/contracts"
import { getObjectWithContent, recordOpened, softDeleteObject } from "@/lib/knowledge/content/repo"
import { enforceKnowledgeRateLimit } from "@/lib/knowledge/ratelimit"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("knowledge.items.get", async () => {
    const scope = await requireScope()
    await enforceKnowledgeRateLimit("knowledge_read", scope.workspaceId)

    const { id } = await params
    const result = await getObjectWithContent(scope, id)
    if (!result) throw new NotFoundError()

    // Per-user state, written to the separate table — never onto the
    // shared content row.
    await recordOpened(scope, id)

    return NextResponse.json({ item: toDetailDto(result) })
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApiHandler("knowledge.items.delete", async () => {
    const scope = await requireScope()
    const { id } = await params
    const deleted = await softDeleteObject(scope, id)
    if (!deleted) throw new NotFoundError()
    return new NextResponse(null, { status: 204 })
  })
}

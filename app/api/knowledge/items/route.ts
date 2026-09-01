import "server-only"

/* GET /api/knowledge/items — the library list.
 *
 * Cursor-paginated, never OFFSET: pages stay stable while items are
 * still being saved into the list above them. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/platform/errors"
import { requireScope } from "@/lib/knowledge/access/scope"
import { toItemDto, type KnowledgeListResponse } from "@/lib/knowledge/api/contracts"
import { listObjects, parseCursor } from "@/lib/knowledge/content/repo"
import { enforceKnowledgeRateLimit } from "@/lib/knowledge/ratelimit"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return withApiHandler("knowledge.items.list", async () => {
    const scope = await requireScope()
    await enforceKnowledgeRateLimit("knowledge_read", scope.workspaceId)

    const url = new URL(req.url)
    const limitParam = Number(url.searchParams.get("limit") ?? 24)
    const limit = Number.isFinite(limitParam) ? limitParam : 24

    const { items, nextCursor } = await listObjects(scope, {
      limit,
      cursor: parseCursor(url.searchParams.get("cursor")),
    })

    const payload: KnowledgeListResponse = { items: items.map(toItemDto), nextCursor }
    return NextResponse.json(payload)
  })
}

import "server-only"

/* POST /api/knowledge/items/[id]/retry — re-arm a failed item. */

import { after, NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/platform/errors"
import { requireScope } from "@/lib/knowledge/access/scope"
import { getObject, retryObject } from "@/lib/knowledge/content/repo"
import { toItemDto } from "@/lib/knowledge/api/contracts"
import { drainInBackground } from "@/lib/knowledge/ingestion/runner"
import { enforceKnowledgeRateLimit } from "@/lib/knowledge/ratelimit"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("knowledge.items.retry", async () => {
    const scope = await requireScope()
    await enforceKnowledgeRateLimit("knowledge_retry", scope.workspaceId)

    const { id } = await params
    const rearmed = await retryObject(scope, id)
    if (!rearmed) {
      // Either it does not exist in this workspace, or it is not in a
      // failed state. Both are 404 from the client's perspective;
      // confirming existence would leak cross-tenant information.
      const exists = await getObject(scope, id)
      if (!exists) throw new NotFoundError()
      return NextResponse.json({ item: toItemDto(exists), rearmed: false }, { status: 409 })
    }

    after(drainInBackground())

    const object = await getObject(scope, id)
    return NextResponse.json({ item: object ? toItemDto(object) : null, rearmed: true }, { status: 202 })
  })
}

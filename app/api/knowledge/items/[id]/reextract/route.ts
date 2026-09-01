import "server-only"

/* ==================================================================
 * POST /api/knowledge/items/[id]/reextract
 *
 * Re-run extraction over the ARCHIVED copy of a page. No fetch: the
 * publisher is never contacted, so this works on a page that has since
 * moved, gone paywalled or disappeared, and cannot be rate-limited by
 * anyone but us.
 *
 * WHAT THIS ENDPOINT DOES NOT DO — it never returns the archived
 * document. Raw HTML from an arbitrary website is attacker-controlled
 * markup; the only thing allowed to read it is an extractor, and there
 * is deliberately no API that hands it to a browser. What comes back
 * is the same sanitized item shape every other endpoint returns.
 *
 * Queued rather than run inline: re-extraction reads a multi-megabyte
 * blob and runs the ladder, which is not work to do while a user's
 * request is open.
 * ================================================================== */

import { after, NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/platform/errors"
import { requireScope } from "@/lib/knowledge/access/scope"
import { getObject } from "@/lib/knowledge/content/repo"
import { latestArtifact } from "@/lib/knowledge/archive/index"
import { toItemDto } from "@/lib/knowledge/api/contracts"
import { enqueueJob } from "@/lib/knowledge/ingestion/jobs"
import { drainInBackground } from "@/lib/knowledge/ingestion/runner"
import { enforceKnowledgeRateLimit } from "@/lib/knowledge/ratelimit"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("knowledge.items.reextract", async () => {
    const scope = await requireScope()
    await enforceKnowledgeRateLimit("knowledge_reextract", scope.workspaceId)

    const { id } = await params
    const object = await getObject(scope, id)
    // Tenant-scoped lookup first: a 404 here is the same answer for
    // "does not exist" and "belongs to someone else".
    if (!object) throw new NotFoundError()

    // Nothing archived means nothing to re-read. Saying so plainly
    // beats queueing work that can only fail — an M1-era item, or one
    // whose fetch never succeeded.
    const artifact = await latestArtifact(scope, id)
    if (!artifact) {
      return NextResponse.json(
        {
          item: toItemDto(object),
          queued: false,
          reason: "We don't have an archived copy of this page to re-read.",
        },
        { status: 409 },
      )
    }

    const queued = await enqueueJob(scope, id, "reextract")

    // One live re-extraction per item: a null here means a runner is
    // already working on exactly this, which is a success for the
    // caller, not a conflict.
    after(drainInBackground())

    return NextResponse.json(
      { item: toItemDto(object), queued: true, alreadyRunning: queued === null },
      { status: 202 },
    )
  })
}

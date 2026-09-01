import "server-only"

/* ================================================================== *
 * POST /api/knowledge/save
 *
 * The first real user action. Returns IMMEDIATELY — the response does
 * not wait for the fetch or the extraction.
 *
 * Synchronous (target well under 200ms):
 *   validate -> canonicalise -> dedupe -> insert object + job in ONE
 *   transaction -> respond
 *
 * Asynchronous (after the response is sent):
 *   after() keeps the runner alive past the response, so extraction
 *   happens outside the request and survives the browser
 *   disconnecting. The job is already durable, so even if the process
 *   dies the reaper recovers it.
 * ================================================================== */

import { after } from "next/server"
import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/platform/errors"
import { logger } from "@/lib/platform/logger"
import { recordAudit } from "@/lib/platform/ratelimit"
import { requireScope } from "@/lib/knowledge/access/scope"
import { toItemDto, type SaveResponse } from "@/lib/knowledge/api/contracts"
import { createObjectWithJob } from "@/lib/knowledge/content/repo"
import { drainInBackground } from "@/lib/knowledge/ingestion/runner"
import { canonicalizeUrl, InvalidUrlError } from "@/lib/knowledge/ingestion/url"
import { enforceKnowledgeRateLimit } from "@/lib/knowledge/ratelimit"

export const runtime = "nodejs"

export async function POST(req: Request) {
  return withApiHandler("knowledge.save", async (requestId) => {
    const scope = await requireScope()
    await enforceKnowledgeRateLimit("knowledge_save", scope.workspaceId)

    const body = (await req.json().catch(() => null)) as { url?: unknown } | null
    if (!body || typeof body.url !== "string") {
      throw new ValidationError("Provide a url to save.")
    }

    let canonical
    try {
      canonical = canonicalizeUrl(body.url)
    } catch (err) {
      // The canonicaliser's messages are already user-facing.
      throw new ValidationError(err instanceof InvalidUrlError ? err.message : "That doesn't look like a valid URL.")
    }

    const { object, created } = await createObjectWithJob(scope, {
      submittedUrl: canonical.submittedUrl,
      canonicalUrl: canonical.canonicalUrl,
      urlHash: canonical.urlHash,
      domain: canonical.domain,
    })

    if (created) {
      await recordAudit({
        orgId: scope.workspaceId,
        userId: scope.userId,
        action: "knowledge.save",
        resourceType: "knowledge_object",
        resourceId: object.id,
        metadata: { domain: object.domain, requestId },
      })
      logger.info("knowledge_saved", {
        requestId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        objectId: object.id,
        domain: object.domain,
      })

      // THE ASYNC BOUNDARY: this runs after the response is sent.
      after(drainInBackground())
    }

    const payload: SaveResponse = { item: toItemDto(object), duplicate: !created }
    return NextResponse.json(payload, { status: created ? 201 : 200 })
  })
}

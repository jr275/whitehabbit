import "server-only"

/* GET  /api/knowledge/indexing — is semantic search actually working,
 *                                and is anything waiting to be indexed?
 * POST /api/knowledge/indexing — queue the outstanding work.
 *
 * WHY THIS ROUTE EXISTS. Both capabilities already existed and neither
 * could be reached: enqueueBackfill had no caller, so an item saved
 * before the pipeline existed could never be indexed in production, and
 * describeSemanticSearch had no caller, so "is semantic search on?" was
 * a question with no answer outside a search response. Documenting
 * operational checks nobody can perform is worse than not having them.
 *
 * SCOPE. Both verbs act on the CALLING USER's own library and nothing
 * else — org and user come from requireSession(), and the survey and
 * the enqueue apply the same scope every other read does. There is no
 * cross-tenant or admin mode here; adding one is a product decision
 * about roles this repository does not yet have.
 *
 * GET is read-only and safe to poll. POST is the write, and is
 * deliberately the smaller surface: it enqueues jobs and returns, it
 * does not run them. The existing tick drains the queue, which is why
 * this creates no second worker and no second queue. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { describeSemanticSearch, resolveEmbeddingProvider } from "@/lib/ai/embeddings"
import { countBacklog, countJobs, enqueueBackfill } from "@/lib/knowledge/backfill"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

export async function GET() {
  return withApiHandler("knowledge.indexing.status", async () => {
    const { organizationId, userId } = await requireSession()
    const scope = { orgId: organizationId, userId }
    const provider = resolveEmbeddingProvider()

    const [backlog, jobs] = await Promise.all([countBacklog(scope), countJobs(scope)])

    return NextResponse.json({
      semanticSearch: describeSemanticSearch(provider),
      // The model identity, never the credential. Which model is
      // configured is exactly what an operator needs when a backlog
      // will not clear, and it is not a secret.
      embedding: { provider: provider.id, model: provider.model, dimensions: provider.dimensions },
      backlog,
      jobs,
    })
  })
}

export async function POST() {
  return withApiHandler("knowledge.indexing.backfill", async () => {
    const { organizationId, userId } = await requireSession()
    const scope = { orgId: organizationId, userId }

    // Each queued job becomes one embedding call per chunk, so this is
    // limited far more tightly than a read. Enforced before the survey
    // runs, not after it.
    await enforceRateLimit("knowledge_backfill", organizationId)

    const result = await enqueueBackfill(scope)

    // Only a run that actually queued something is worth an audit row.
    // A repeat call on an already-queued library is a no-op by design.
    if (result.enqueued > 0) {
      await recordAudit({
        orgId: organizationId,
        userId,
        action: "knowledge.indexing.backfill",
        resourceType: "knowledge_item",
        resourceId: null,
      })
    }

    return NextResponse.json(result)
  })
}

import "server-only"

/* POST /api/knowledge/:id/summarize — generate an AI summary for one
 * item's already-extracted text, on demand only. Never called by the
 * ingestion pipeline; never regenerates once a summary exists — a
 * repeat call for the same item just returns the cached one (and is
 * NOT rate-limited, since it costs nothing). A genuinely new summary
 * costs one real Anthropic Messages API call and IS rate-limited.
 *
 * Owner-scoped like every other :id route (S5): another user's item
 * in the same org is indistinguishable from a nonexistent one. */

import { NextResponse } from "next/server"
import { AiNotConfiguredError, NotFoundError, UpstreamServiceError, ValidationError, withApiHandler } from "@/lib/api-error"
import { rowToItem } from "@/lib/knowledge/adapter"
import { AiSummaryUpstreamError } from "@/lib/knowledge/ai-summary"
import * as repo from "@/lib/knowledge/repo"
import { SaveValidationError, ServiceAiNotConfiguredError, summarizeItem } from "@/lib/knowledge/service"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler("knowledge.summarize", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params

    const row = await repo.getItem(id, organizationId, userId)
    if (!row) throw new NotFoundError()

    // Only a genuine cache miss spends real money — a re-open of an
    // already-summarized item must never count against this budget.
    if (!row.summary) await enforceRateLimit("knowledge_summarize", organizationId)

    let result
    try {
      result = await summarizeItem(row, organizationId, userId)
    } catch (err) {
      if (err instanceof SaveValidationError) throw new ValidationError(err.message)
      if (err instanceof ServiceAiNotConfiguredError) throw new AiNotConfiguredError(err.message)
      if (err instanceof AiSummaryUpstreamError) throw new UpstreamServiceError(err.message)
      throw err
    }

    if (result.generated) {
      await recordAudit({ orgId: organizationId, userId, action: "knowledge.summarize", resourceType: "knowledge_item", resourceId: id })
    }

    const tags = await repo.getTags(id, organizationId, userId)
    return NextResponse.json({ item: rowToItem(result.row, tags) })
  })
}

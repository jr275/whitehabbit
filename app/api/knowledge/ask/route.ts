import "server-only"

/* POST /api/knowledge/ask — answer a question from the pieces THIS
 * user saved, with citations.
 *
 * Authenticated only, and deliberately so. There is no guest path here:
 * guest mode is a browser-local library, and answering from it would
 * mean the browser shipping its own stored articles to this route and
 * on to Anthropic. That is a different product decision with different
 * privacy consequences, so an unauthenticated caller gets the same 401
 * every other Knowledge route gives, and the UI asks them to sign in.
 *
 * Tenancy comes only from requireSession(): the browser never sends an
 * organizationId or a userId, and if it did, nothing here would read
 * it. Retrieval runs through repo.searchItems/listItems, which filter
 * on (org_id, created_by) in SQL — the same filter the Library uses.
 *
 * Rate limited on the existing knowledge_summarize budget rather than a
 * new one: both spend a real Anthropic call, and adding a limit was out
 * of scope for this change. */

import { NextResponse } from "next/server"
import { AiNotConfiguredError, UpstreamServiceError, ValidationError, withApiHandler } from "@/lib/api-error"
import { AiUpstreamError } from "@/lib/knowledge/ai-summary"
import { AskNotConfiguredError, AskValidationError, askLibrary, MAX_QUESTION_CHARS } from "@/lib/knowledge/ask"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export async function POST(req: Request) {
  return withApiHandler("knowledge.ask", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("knowledge_summarize", organizationId)

    const body = (await req.json().catch(() => null)) as { question?: unknown } | null
    if (!body || typeof body.question !== "string") throw new ValidationError("A question string is required.")
    if (body.question.length > MAX_QUESTION_CHARS * 4) {
      // A cheap guard before any work: the real limit lives in
      // askLibrary, this only stops an absurd payload reaching it.
      throw new ValidationError(`Keep the question under ${MAX_QUESTION_CHARS} characters.`)
    }

    try {
      const result = await askLibrary({ orgId: organizationId, userId, question: body.question })
      return NextResponse.json(result, { status: 200 })
    } catch (err) {
      if (err instanceof AskValidationError) throw new ValidationError(err.message)
      if (err instanceof AskNotConfiguredError) throw new AiNotConfiguredError(err.message)
      if (err instanceof AiUpstreamError) throw new UpstreamServiceError(err.message)
      throw err
    }
  })
}

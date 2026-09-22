import "server-only"

/* POST /api/knowledge/ai — answer a question from the CALLING USER's
 * own saved library, with citations that resolve to real items.
 *
 * Org and user come only from requireSession(); the browser supplies
 * neither, so this can no more read a colleague's library than
 * /api/knowledge/search can (S5). The filters in the body narrow the
 * search and cannot widen it — scope is applied in SQL beneath every
 * filter, in lib/knowledge/search/retrievers.ts, and the request type
 * has no field through which an org or user could be named.
 *
 * Rate-limited per org because a genuine answer costs a real model
 * call. The refusal path costs none, but is limited too: it still runs
 * an embedding call and a vector query, and a question that retrieves
 * nothing is exactly what an abusive client sends repeatedly.
 *
 * Request validation lives in lib/knowledge/ai.ts rather than here, so
 * it can be unit tested (this file imports next/server, which the
 * repo's plain-Node test runner cannot load) and so the browser
 * enforces the same limits before spending a rate-limit slot. */

import { NextResponse } from "next/server"
import { AiNotConfiguredError, UpstreamServiceError, ValidationError, withApiHandler } from "@/lib/api-error"
import { InvalidAskRequestError, parseAskRequest } from "@/lib/knowledge/ai"
import {
  answerFromKnowledge,
  KnowledgeAnswerNotConfiguredError,
  KnowledgeAnswerUpstreamError,
} from "@/lib/knowledge/answer"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

export async function POST(req: Request) {
  return withApiHandler("knowledge.ai", async () => {
    const { organizationId, userId } = await requireSession()

    let ask
    try {
      ask = parseAskRequest(await req.json().catch(() => null))
    } catch (err) {
      if (err instanceof InvalidAskRequestError) throw new ValidationError(err.message)
      throw err
    }

    await enforceRateLimit("knowledge_ai", organizationId)

    let answer
    try {
      answer = await answerFromKnowledge({
        question: ask.question,
        scope: { orgId: organizationId, userId },
        mode: ask.mode,
        filters: { itemIds: ask.itemIds, includeArchived: ask.includeArchived },
      })
    } catch (err) {
      if (err instanceof KnowledgeAnswerNotConfiguredError) throw new AiNotConfiguredError(err.message)
      if (err instanceof KnowledgeAnswerUpstreamError) throw new UpstreamServiceError(err.message)
      throw err
    }

    // Only a real generation is worth an audit row: the refusal path
    // touched no provider and produced no content.
    if (answer.status === "answered") {
      await recordAudit({
        orgId: organizationId,
        userId,
        action: "knowledge.ai",
        resourceType: "knowledge_answer",
        resourceId: null,
      })
    }

    return NextResponse.json(answer)
  })
}

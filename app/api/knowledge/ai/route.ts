import "server-only"

/* POST /api/knowledge/ai — answer a question from the CALLING USER's
 * own saved library, with citations that resolve to real items.
 *
 * Org and user come only from requireSession(); the browser supplies
 * neither, so this can no more read a colleague's library than
 * /api/knowledge/search can (S5). The filters in the body narrow the
 * search and cannot widen it — scope is applied in SQL, below every
 * filter, in lib/knowledge/search/retrievers.ts.
 *
 * Rate-limited per org because a genuine answer costs a real model
 * call. The refusal path (nothing retrieved) costs nothing, but is
 * limited too: it still runs a vector query and an embedding call, and
 * a question that retrieves nothing is exactly what an abusive client
 * would send repeatedly. */

import { NextResponse } from "next/server"
import { AiNotConfiguredError, UpstreamServiceError, ValidationError, withApiHandler } from "@/lib/api-error"
import {
  answerFromKnowledge,
  KnowledgeAnswerNotConfiguredError,
  KnowledgeAnswerUpstreamError,
  MAX_QUESTION_CHARS,
} from "@/lib/knowledge/answer"
import type { RetrievalMode } from "@/lib/knowledge/search/types"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

const MODES: RetrievalMode[] = ["lexical", "semantic", "hybrid"]
const MAX_ITEM_FILTER = 50

interface AskBody {
  question?: unknown
  mode?: unknown
  itemIds?: unknown
  includeArchived?: unknown
}

export async function POST(req: Request) {
  return withApiHandler("knowledge.ai", async () => {
    const { organizationId, userId } = await requireSession()

    const body = (await req.json().catch(() => null)) as AskBody | null
    const question = typeof body?.question === "string" ? body.question.trim() : ""
    if (question.length < 2) throw new ValidationError("Ask a question of at least 2 characters.")
    if (question.length > MAX_QUESTION_CHARS) {
      throw new ValidationError(`A question must be ${MAX_QUESTION_CHARS} characters or fewer.`)
    }

    // An unrecognised mode is a client bug, not a reason to silently
    // answer a different way than was asked for.
    let mode: RetrievalMode | undefined
    if (body?.mode !== undefined) {
      if (typeof body.mode !== "string" || !MODES.includes(body.mode as RetrievalMode)) {
        throw new ValidationError(`mode must be one of: ${MODES.join(", ")}.`)
      }
      mode = body.mode as RetrievalMode
    }

    let itemIds: string[] | undefined
    if (body?.itemIds !== undefined) {
      if (!Array.isArray(body.itemIds) || body.itemIds.some((id) => typeof id !== "string")) {
        throw new ValidationError("itemIds must be an array of item ids.")
      }
      if (body.itemIds.length > MAX_ITEM_FILTER) {
        throw new ValidationError(`itemIds may contain at most ${MAX_ITEM_FILTER} ids.`)
      }
      itemIds = body.itemIds as string[]
    }

    await enforceRateLimit("knowledge_ai", organizationId)

    let answer
    try {
      answer = await answerFromKnowledge({
        question,
        scope: { orgId: organizationId, userId },
        mode,
        filters: { itemIds, includeArchived: body?.includeArchived === true },
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

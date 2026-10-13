import "server-only"

/* ================================================================== *
 * POST /api/knowledge/ai/stream — the same grounded answer as
 * POST /api/knowledge/ai, with the pipeline's real stages reported as
 * they happen.
 *
 * SAME ENGINE, SAME GUARDS, DIFFERENT TRANSPORT. This is not a second
 * runtime. It calls the identical answerFromKnowledge, behind the
 * identical requireSession, the identical parseAskRequest and the
 * identical rate-limit bucket. Anything true of the JSON route is true
 * here by construction rather than by resemblance:
 *
 *   - org and user come only from the session; the body cannot name
 *     either, so this can no more read a colleague's library than the
 *     JSON route can (S5)
 *   - the SAME "knowledge_ai" bucket, so a second endpoint onto the
 *     same model spend does not come with a second allowance
 *   - the audit row is written on the same condition (a real answer
 *     was generated) and at most once
 *
 * ---- THIS FILE IS DELIBERATELY THIN -------------------------------
 *
 * Everything after the status line lives in lib/knowledge/ask-stream.ts,
 * because this module imports next/server and the repo's plain-Node
 * test runner cannot load it — so anything left here could only be
 * checked by reading the source. The stream's real guarantees (exactly
 * one terminal event, a disconnect stops the writing, close() happens
 * once) are executed against runAskStream in
 * tests/knowledge/ask-stream.test.ts instead. What remains here is
 * HTTP: session, validation, limit, headers, and adapting a
 * ReadableStream controller to the transport interface.
 *
 * ---- WHERE THE TWO ROUTES NECESSARILY DIFFER ----------------------
 *
 * An HTTP status can only be sent before the body starts, so failures
 * split by WHEN they happen, and that split is the contract:
 *
 *   BEFORE the first byte — no session, a malformed question, a spent
 *   rate limit — are ordinary HTTP errors with no stream at all. They
 *   go through withApiHandler, so status and body are what the JSON
 *   route returns. A 401 must never arrive as a 200 carrying a sad
 *   event.
 *
 *   AFTER the first byte — the provider failing mid-answer — cannot
 *   change the status, so they arrive as RUN_ERROR and the stream
 *   closes.
 *
 * ---- DISCONNECTION ------------------------------------------------
 *
 * req.signal is passed down to callLlm, which combines it with the
 * provider's own timeout, so a disconnect aborts the HTTP request to
 * the model instead of merely discarding its answer. The provider
 * reports that as reason "aborted", which the pipeline turns into
 * KnowledgeAnswerCancelledError and runAskStream treats as a quiet
 * terminal state: no RUN_ERROR, logged at info, nothing invented.
 *
 * What this does NOT claim: that the model stopped generating. Closing
 * the connection is all a client can do; what the provider does with a
 * dropped request is its business and is not observable from here.
 *
 * A cancelled run writes no audit row, because the condition is
 * unchanged — only an answer that was really generated is audited, and
 * a cancelled one was not.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { ASK_STREAM_CONTENT_TYPE, type AskRunIds } from "@/lib/knowledge/agui"
import { InvalidAskRequestError, parseAskRequest } from "@/lib/knowledge/ai"
import { runAskStream, type AskStreamTransport } from "@/lib/knowledge/ask-stream"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export const runtime = "nodejs"
/** Matches app/api/workers/[id]/run — Vercel Hobby's configurable ceiling. */
export const maxDuration = 60

export async function POST(req: Request): Promise<NextResponse> {
  return withApiHandler("knowledge.ai.stream", async (requestId) => {
    // ---- before the first byte: ordinary HTTP, identical to the JSON route.
    const { organizationId, userId } = await requireSession()

    let ask
    try {
      ask = parseAskRequest(await req.json().catch(() => null))
    } catch (err) {
      if (err instanceof InvalidAskRequestError) throw new ValidationError(err.message)
      throw err
    }

    await enforceRateLimit("knowledge_ai", organizationId)

    const ids: AskRunIds = { threadId: randomUUID(), runId: randomUUID() }
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const transport: AskStreamTransport = {
          // Throws once the controller is closed; runAskStream reads
          // that as "the consumer is gone".
          send: (line) => controller.enqueue(encoder.encode(line)),
          close: () => controller.close(),
          aborted: () => req.signal.aborted,
        }

        // Not awaited: start() must return so the response can begin
        // flushing. runAskStream owns closing the controller, on every
        // path including failure, so the stream always terminates.
        return runAskStream({
          ids,
          input: {
            question: ask.question,
            scope: { orgId: organizationId, userId },
            mode: ask.mode,
            filters: { itemIds: ask.itemIds, includeArchived: ask.includeArchived },
          },
          transport,
          requestId,
          /* Closes the cancellation chain: the browser aborting its
           * fetch fires req.signal, which reaches callLlm, which hands
           * it to the provider's own fetch. A disconnect therefore
           * cancels the HTTP request to the model rather than merely
           * discarding its answer. */
          deps: { signal: req.signal },
          hooks: {
            onAnswered: async () => {
              await recordAudit({
                orgId: organizationId,
                userId,
                action: "knowledge.ai",
                resourceType: "knowledge_answer",
                resourceId: null,
              })
            },
          },
        })
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "content-type": ASK_STREAM_CONTENT_TYPE,
        // A partial answer must never be replayed from a cache as the
        // whole one.
        "cache-control": "no-store, no-transform",
        "x-content-type-options": "nosniff",
      },
    })
  })
}

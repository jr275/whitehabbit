import "server-only"

/* ================================================================== *
 * THE ASK RUN, ORCHESTRATED — everything the streaming route does
 * except HTTP.
 *
 * WHY THIS IS NOT IN THE ROUTE. app/api/knowledge/ai/stream/route.ts
 * imports next/server, which this repo's plain-Node test runner cannot
 * load, so anything left in there can only ever be checked by reading
 * the source. The repo already answers this the same way for request
 * validation — "Request validation lives in lib/knowledge/ai.ts rather
 * than here, so it can be unit tested" (app/api/knowledge/ai/route.ts).
 * The stream's guarantees are the ones most worth executing rather
 * than eyeballing: that there is exactly one terminal event, that a
 * disconnect stops the writing, that the transport is closed once.
 * So they live here, and the route is a thin adapter.
 *
 * ---- THE GUARANTEES THIS FUNCTION MAKES --------------------------
 *
 *  1. RUN_STARTED is the first event, always.
 *  2. Exactly ONE terminal event — RUN_FINISHED or RUN_ERROR. Never
 *     both, never neither, even if the transport fails mid-run or the
 *     audit hook throws.
 *  3. close() is called exactly once, even on an exception.
 *  4. Once the consumer is gone, nothing further is written. The run
 *     still completes: callLlm takes no AbortSignal (lib/ai/llm), so
 *     a disconnect cannot cancel an in-flight model call, and claiming
 *     otherwise would be the dishonest version of this.
 *  5. The audit hook runs only for a real generation, at most once,
 *     and its failure never discards an answer the user already paid
 *     for.
 *
 * None of these is a comment that hopes to be true: each is asserted
 * in tests/knowledge/ask-stream.test.ts against this function.
 * ================================================================== */

import { logger } from "@/lib/observability/logger"

import {
  answerEvent,
  encodeAskEvent,
  runError,
  runFinished,
  runStarted,
  type AskEvent,
  type AskRunIds,
} from "./agui"
import {
  answerFromKnowledge,
  KnowledgeAnswerCancelledError,
  KnowledgeAnswerNotConfiguredError,
  KnowledgeAnswerUpstreamError,
  type AnswerDeps,
  type AnswerInput,
} from "./answer"
import type { KnowledgeAnswer } from "./ai"

/**
 * Where encoded events go. One line per event, already newline-
 * terminated by encodeAskEvent.
 *
 * `send` may throw — that is how a closed consumer reports itself, and
 * it is treated as "the consumer is gone", not as an error to surface.
 */
export interface AskStreamTransport {
  send(line: string): void
  close(): void
  /** True once the consumer has disconnected. Polled before each write
   *  so a run that is still finishing writes nothing further. */
  aborted?(): boolean
}

export interface AskStreamHooks {
  /** Called once, only when a real answer was generated. Used for the
   *  audit row. A rejection here is logged, never propagated. */
  onAnswered?(answer: KnowledgeAnswer): Promise<void>
}

/** A failure that happened after the HTTP status was already sent. The
 *  message is safe for a stranger; the detail is for the log only. */
export function describeStreamFailure(err: unknown): { message: string; code: string; detail: string } {
  if (err instanceof KnowledgeAnswerNotConfiguredError) {
    // Already a safe "this deployment has no model credential" sentence.
    return { message: err.message, code: "not_configured", detail: err.message }
  }
  if (err instanceof KnowledgeAnswerUpstreamError) {
    // Generic by design — see lib/knowledge/answer.ts.
    return { message: err.message, code: "upstream", detail: err.message }
  }
  return {
    message: "Something went wrong. Try again.",
    code: "internal",
    detail: err instanceof Error ? err.message : String(err),
  }
}

export interface RunAskStreamOptions {
  ids: AskRunIds
  input: AnswerInput
  transport: AskStreamTransport
  deps?: AnswerDeps
  hooks?: AskStreamHooks
  /** For the log only; never written to the stream. */
  requestId?: string
}

export async function runAskStream(options: RunAskStreamOptions): Promise<void> {
  const { ids, input, transport, deps = {}, hooks = {}, requestId } = options

  let open = true
  /** Guards guarantee 2: the first terminal event wins and no second
   *  one can be written, whatever order the failure paths run in. */
  let terminated = false

  const write = (event: AskEvent): void => {
    if (!open) return
    if (transport.aborted?.()) {
      open = false
      return
    }
    try {
      transport.send(encodeAskEvent(event))
    } catch {
      // The consumer went away between the check and the write. That
      // is the end of the stream, not a failure of the run.
      open = false
    }
  }

  const terminate = (event: AskEvent): void => {
    if (terminated) return
    terminated = true
    write(event)
  }

  write(runStarted(ids))

  try {
    const answer = await answerFromKnowledge(input, { ...deps, onEvent: write })

    if (answer.status === "answered" && hooks.onAnswered) {
      // The answer is already generated and paid for. An audit failure
      // is a logging problem, not a reason to tell the user it failed.
      await hooks.onAnswered(answer).catch((err: unknown) => {
        logger.error("knowledge_ask_stream_audit_failed", {
          requestId,
          message: err instanceof Error ? err.message : String(err),
        })
      })
    }

    // The answer still travels whole, once, as the record. The events
    // described how it was produced; this is what it is.
    write(answerEvent(answer))
    terminate(runFinished(ids, answer.status))
  } catch (err) {
    /* CANCELLATION IS A TERMINAL STATE, NOT A FAILURE.
     *
     * The consumer asked to stop, so there is nobody to tell and
     * nothing went wrong. No RUN_ERROR is emitted — writing one would
     * be inventing a failure — and it is logged at info, so an
     * operator reading warnings is not shown someone closing a tab.
     * `terminated` is still set, which keeps the "exactly one terminal
     * event" invariant honest: the run ended, it just ended quietly. */
    if (err instanceof KnowledgeAnswerCancelledError) {
      logger.info("knowledge_ask_stream_cancelled", { requestId })
      terminated = true
    } else {
      const { message, code, detail } = describeStreamFailure(err)
      logger.warn("knowledge_ask_stream_failed", { requestId, code, detail })
      terminate(runError(message, code))
    }
  } finally {
    open = false
    try {
      transport.close()
    } catch {
      // Already closed by the consumer's own cancellation.
    }
  }
}

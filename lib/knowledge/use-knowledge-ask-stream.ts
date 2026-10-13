"use client"

/* ================================================================== *
 * ASK, STREAMED — the client half of POST /api/knowledge/ai/stream.
 *
 * Same discipline as lib/knowledge/use-knowledge-ai.ts, which this
 * sits beside rather than replaces: every state is entered because the
 * server reported something. Nothing here invents progress, and the
 * reducer it delegates to (lib/knowledge/ask-run.ts) refuses to
 * materialise a message or a step the stream did not announce.
 *
 * ---- THREE KINDS OF FAILURE, KEPT APART ---------------------------
 *
 * They are genuinely different and flattening them would lose the one
 * fact the user needs:
 *
 *   failure     — the request was refused BEFORE the stream began:
 *                 401, 400, 429, 503. Classified by the SAME
 *                 KnowledgeApiError → classifyFailure mapping the
 *                 non-streaming path uses, so a rate limit reads as a
 *                 rate limit here too. A second error taxonomy for the
 *                 same statuses is exactly the kind of parallel
 *                 representation that drifts.
 *   run.error   — RUN_ERROR arrived mid-stream. The run started and
 *                 the server said why it stopped.
 *   run.truncated — the stream ended with no terminal event. Nobody
 *                 said anything failed; the connection just stopped.
 *                 Reporting that as an error would be a claim the
 *                 server never made.
 *
 * ---- CANCELLATION -------------------------------------------------
 *
 * cancel() aborts the fetch, so the browser stops reading and the
 * route's req.signal fires and stops writing. It does NOT cancel the
 * model call: callLlm takes no AbortSignal (lib/ai/llm), so the run
 * finishes server-side and is still audited. The UI says "stopped",
 * not "cancelled the work", because only the first is true.
 * ================================================================== */

import { useCallback, useEffect, useRef, useState } from "react"

import { AskStreamOverflowError, createAskStreamReader, runError } from "./agui"
import { MIN_QUESTION_CHARS } from "./ai"
import { classifyFailure, KnowledgeApiError, type AskFailure } from "./client"
import {
  finalizeAskRun,
  initialAskRunState,
  reduceAskEvent,
  type AskRunState,
} from "./ask-run"

const STREAM_URL = "/api/knowledge/ai/stream"

export type { AskFailure } from "./client"

export interface UseAskStreamResult {
  /** The question this run is for, so a stale run can never be shown
   *  under a new question. */
  question: string | null
  run: AskRunState
  /** A pre-stream refusal, classified exactly as the non-streaming
   *  path classifies it. */
  failure: AskFailure | null
  /** True while bytes may still arrive. */
  streaming: boolean
  ask: (question: string) => void
  /** Stop reading. The server-side run still completes. */
  cancel: () => void
  reset: () => void
}

/** The server always answers a refused request with {"error": string}
 *  (lib/api-error.ts). Anything else is a proxy or a crash, and gets a
 *  generic sentence rather than raw text of unknown provenance. */
async function readHttpError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as unknown
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error
    }
  } catch {
    /* not JSON */
  }
  return "Something went wrong. Try again."
}

export function useKnowledgeAskStream(): UseAskStreamResult {
  const [question, setQuestion] = useState<string | null>(null)
  const [run, setRun] = useState<AskRunState>(initialAskRunState)
  const [failure, setFailure] = useState<AskFailure | null>(null)
  const [streaming, setStreaming] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  const ask = useCallback((raw: string) => {
    const q = raw.trim()
    // The server enforces this too (400). Checking here avoids spending
    // a request and a rate-limit slot on something we know it rejects.
    if (q.length < MIN_QUESTION_CHARS) return

    inFlight.current?.abort()
    const ac = new AbortController()
    inFlight.current = ac

    setQuestion(q)
    setRun(initialAskRunState())
    setFailure(null)
    setStreaming(true)

    void (async () => {
      try {
        const res = await fetch(STREAM_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: q }),
          signal: ac.signal,
        })

        if (!res.ok || !res.body) {
          // Refused before the stream began — a real HTTP status.
          const message = res.ok ? "Something went wrong. Try again." : await readHttpError(res)
          // Same classification as the JSON path: one taxonomy, one
          // set of user-facing words, one retryable flag.
          if (!ac.signal.aborted) setFailure(classifyFailure(new KnowledgeApiError(message, res.status)))
          return
        }

        const reader = res.body.getReader()
        /* Owns the decoder, the line splitting and the byte cap, so a
         * server that sends bytes and never a newline cannot grow this
         * client's memory without limit. See createAskStreamReader. */
        const stream = createAskStreamReader()

        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            /* STALE EVENTS. A superseded ask() aborts this controller,
             * but a read() that had already resolved still lands here —
             * and this closure would then fold the OLD run's events
             * into the NEW run's state, which has just been reset.
             * Checking the signal on every iteration is what keeps two
             * runs from sharing one state object. */
            if (ac.signal.aborted) return
            for (const event of stream.push(value)) {
              setRun((prev) => reduceAskEvent(prev, event))
            }
          }
        } catch (err) {
          if (ac.signal.aborted) return
          if (err instanceof AskStreamOverflowError) {
            /* A terminal state, not a hanging spinner. The message
             * says what the reader can honestly say; the byte count
             * and the payload stay out of it and out of any log. */
            setRun((prev) =>
              reduceAskEvent(
                prev,
                runError("That response was too large to read. Try a narrower question.", "stream_overflow"),
              ),
            )
            await reader.cancel().catch(() => {})
            return
          }
          throw err
        }

        // End of stream. finalizeAskRun records truncation if no
        // terminal event ever arrived, and stops any step pretending
        // to still be running. Skipped for a superseded run, whose
        // state no longer belongs to this closure.
        if (!ac.signal.aborted) setRun(finalizeAskRun)
      } catch {
        // An abort is a superseded question or a deliberate stop, not
        // a failure, and must not be reported as one.
        if (ac.signal.aborted) return
        // fetch() rejects with a TypeError when the request never
        // completed; classifyFailure turns that into "network".
        setFailure(classifyFailure(new TypeError("fetch failed")))
      } finally {
        if (!ac.signal.aborted) setStreaming(false)
      }
    })()
  }, [])

  const cancel = useCallback(() => {
    inFlight.current?.abort()
    inFlight.current = null
    setStreaming(false)
    // Whatever arrived stays on screen; the run is marked cut off
    // rather than failed, because nothing failed.
    setRun(finalizeAskRun)
  }, [])

  const reset = useCallback(() => {
    inFlight.current?.abort()
    inFlight.current = null
    setStreaming(false)
    setQuestion(null)
    setFailure(null)
    setRun(initialAskRunState())
  }, [])

  return { question, run, failure, streaming, ask, cancel, reset }
}

"use client"

/* ================================================================== *
 * ASK — the state machine for /knowledge/ai.
 *
 * Every state below is entered because the backend reported something,
 * never because the UI guessed. That is the whole discipline of this
 * feature: the failure it exists to prevent is a confident answer with
 * no evidence behind it, and a frontend that invents a state is the
 * same failure wearing different clothes.
 *
 * In particular there is no "helpful" fallback anywhere here — no
 * cached answer replayed on error, no partial render of a malformed
 * payload, no client-side summary when the server declines. When we do
 * not have an answer, the UI says so.
 * ================================================================== */

import { useCallback, useEffect, useRef, useState } from "react"
import { askLibrary, classifyFailure, type AskFailure } from "./client"
import { classifyAnswer, MIN_QUESTION_CHARS, type AnswerOutcome, type KnowledgeAnswer } from "./ai"

export type { AskFailure, AskFailureKind } from "./client"

/** Exactly one of these is true at a time, and each is entered on a
 *  fact the backend reported. The question travels with every phase so
 *  a stale answer can never be shown under a new question. */
export type AskState =
  | { phase: "idle" }
  | { phase: "loading"; question: string }
  | { phase: "result"; question: string; outcome: AnswerOutcome }
  | { phase: "error"; question: string; failure: AskFailure }

export interface UseAskResult {
  state: AskState
  ask: (question: string) => void
  reset: () => void
  /** The last answer, kept so a retry does not blank the page. Cleared
   *  by reset(). Never rendered as the answer to a NEW question — the
   *  question it answered travels with it. */
  last: KnowledgeAnswer | null
}

export function useKnowledgeAsk(): UseAskResult {
  const [state, setState] = useState<AskState>({ phase: "idle" })
  const [last, setLast] = useState<KnowledgeAnswer | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  const ask = useCallback((raw: string) => {
    const question = raw.trim()
    // The server enforces this too (400). Checking here avoids
    // spending a request and a rate-limit slot on something we already
    // know it will reject.
    if (question.length < MIN_QUESTION_CHARS) return

    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    setState({ phase: "loading", question })
    askLibrary(question, {}, controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return
        setLast(answer)
        setState({ phase: "result", question, outcome: classifyAnswer(answer) })
      })
      .catch((err: unknown) => {
        // An aborted request is a superseded question, not a failure.
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return
        setState({ phase: "error", question, failure: classifyFailure(err) })
      })
  }, [])

  const reset = useCallback(() => {
    inFlight.current?.abort()
    setLast(null)
    setState({ phase: "idle" })
  }, [])

  return { state, ask, reset, last }
}

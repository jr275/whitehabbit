"use client"

/* ================================================================== *
 * RESEARCH — the state machine for /knowledge/research.
 *
 * The same discipline as Ask: every state below is entered because the
 * backend reported something. There is no cached brief replayed on
 * error, no partial render, and no client-side synthesis when the
 * server declines. When we do not have a brief, the UI says so.
 * ================================================================== */

import { useCallback, useEffect, useRef, useState } from "react"
import { classifyFailure, researchObjective, type AskFailure } from "./client"
import { MIN_OBJECTIVE_CHARS, type ResearchBrief } from "./research-contract"

export type ResearchState =
  | { phase: "idle" }
  | { phase: "loading"; objective: string }
  | { phase: "done"; objective: string; brief: ResearchBrief }
  | { phase: "error"; objective: string; failure: AskFailure }

export interface UseResearchResult {
  state: ResearchState
  research: (objective: string) => void
  reset: () => void
}

export function useKnowledgeResearch(): UseResearchResult {
  const [state, setState] = useState<ResearchState>({ phase: "idle" })
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  const research = useCallback((raw: string) => {
    const objective = raw.trim()
    // The server enforces this too. Checking here avoids spending a
    // request and a rate-limit slot on something already known to fail.
    if (objective.length < MIN_OBJECTIVE_CHARS) return

    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    setState({ phase: "loading", objective })
    researchObjective(objective, controller.signal)
      .then((brief) => {
        if (controller.signal.aborted) return
        setState({ phase: "done", objective, brief })
      })
      .catch((err: unknown) => {
        // An aborted request is a superseded objective, not a failure.
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return
        setState({ phase: "error", objective, failure: classifyFailure(err) })
      })
  }, [])

  const reset = useCallback(() => {
    inFlight.current?.abort()
    setState({ phase: "idle" })
  }, [])

  return { state, research, reset }
}

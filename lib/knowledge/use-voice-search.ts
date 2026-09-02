"use client"

/* ================================================================== *
 * useVoiceSearch — the thin React wrapper around VoiceSearchController
 * (lib/knowledge/voice-search.ts). All the real state-machine logic
 * lives there, isolated and unit-tested with no DOM; this hook only
 * exists to give a component real React state and a stable start/stop.
 * ================================================================== */

import { useEffect, useRef, useState } from "react"
import { getSpeechRecognitionFactory, messageForState, VoiceSearchController, type VoiceSearchState } from "./voice-search"

export interface UseVoiceSearchResult {
  state: VoiceSearchState
  /** Live partial transcript while listening — display-only; a search
   *  is only ever fired from the final transcript. */
  interimTranscript: string
  /** Short, user-facing copy for permission-denied/unsupported/error;
   *  null for every other state (those show through the button itself). */
  message: string | null
  start: () => void
  stop: () => void
}

/** `onFinalTranscript` fires exactly once per completed utterance,
 *  with the trimmed final text — the caller's whole job is normally
 *  just `setQuery(transcript)`; the existing debounced search effect
 *  takes it from there. */
export function useVoiceSearch(onFinalTranscript: (transcript: string) => void): UseVoiceSearchResult {
  const [state, setState] = useState<VoiceSearchState>("idle")
  const [interimTranscript, setInterimTranscript] = useState("")
  const controllerRef = useRef<VoiceSearchController | null>(null)

  // Always call the LATEST callback without re-creating the controller
  // (and therefore without losing an in-flight capture) when the
  // caller's onFinalTranscript identity changes across renders.
  const onFinalTranscriptRef = useRef(onFinalTranscript)
  onFinalTranscriptRef.current = onFinalTranscript

  useEffect(() => {
    const controller = new VoiceSearchController(
      getSpeechRecognitionFactory(),
      (nextState, interim) => {
        setState(nextState)
        setInterimTranscript(interim)
      },
      (transcript) => onFinalTranscriptRef.current(transcript),
    )
    controllerRef.current = controller
    setState(controller.getState())
    return () => {
      controller.stop()
      controllerRef.current = null
    }
  }, [])

  // A completed capture (success/permission-denied/error) is shown
  // briefly, then the button settles back to idle on its own — never
  // stuck showing "done" forever, never needs the user to dismiss it.
  useEffect(() => {
    if (state !== "success" && state !== "permission-denied" && state !== "error") return
    const timer = setTimeout(() => controllerRef.current?.reset(), state === "success" ? 1200 : 3000)
    return () => clearTimeout(timer)
  }, [state])

  return {
    state,
    interimTranscript,
    message: messageForState(state),
    start: () => controllerRef.current?.start(),
    stop: () => controllerRef.current?.stop(),
  }
}

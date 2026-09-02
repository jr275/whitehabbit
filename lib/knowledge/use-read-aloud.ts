"use client"

/* ================================================================== *
 * useReadAloud — the thin React wrapper around ReadAloudController
 * (lib/knowledge/read-aloud.ts). All the real state-machine logic
 * lives there, isolated and unit-tested with no DOM; this hook only
 * exists to give the Reader real React state and a stable set of
 * controls, and to guarantee cleanup on unmount / item change.
 * ================================================================== */

import { useEffect, useRef, useState } from "react"
import { ReadAloudController, getDefaultLang, getSpeechEngine, messageForReadAloudState, type ReadAloudState } from "./read-aloud"

export interface UseReadAloudResult {
  state: ReadAloudState
  /** Short, user-facing copy for unsupported/unavailable/error;
   *  null for every other state (those show through the controls). */
  message: string | null
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  next: () => void
  previous: () => void
  hasNext: boolean
  hasPrevious: boolean
}

/** `id` keys the controller's lifetime — pass the document's own id.
 *  Reading a NEW document (id changes) tears down any in-progress
 *  speech and starts a fresh controller over the new paragraphs;
 *  simply re-rendering with the same id (a new `paragraphs` array
 *  reference from the same content) does not interrupt playback. */
export function useReadAloud(id: string, paragraphs: string[], lang?: string): UseReadAloudResult {
  const [state, setState] = useState<ReadAloudState>("idle")
  const [index, setIndex] = useState(0)
  const [queueLength, setQueueLength] = useState(0)
  const controllerRef = useRef<ReadAloudController | null>(null)

  const paragraphsRef = useRef(paragraphs)
  paragraphsRef.current = paragraphs
  const langRef = useRef(lang)
  langRef.current = lang

  useEffect(() => {
    const controller = new ReadAloudController(
      paragraphsRef.current,
      langRef.current ?? getDefaultLang(),
      getSpeechEngine(),
      setState,
      setIndex,
    )
    controllerRef.current = controller
    setState(controller.getState())
    setIndex(0)
    setQueueLength(controller.getQueueLength())
    return () => {
      // Covers all of: component unmounts, user leaves the Reader,
      // and the item changes (this effect re-runs on a new `id`) —
      // the one place speech synthesis is ever torn down.
      controller.stop()
      controllerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on id only, see doc comment above
  }, [id])

  return {
    state,
    message: messageForReadAloudState(state),
    play: () => controllerRef.current?.play(),
    pause: () => controllerRef.current?.pause(),
    resume: () => controllerRef.current?.resume(),
    stop: () => controllerRef.current?.stop(),
    next: () => controllerRef.current?.next(),
    previous: () => controllerRef.current?.previous(),
    hasNext: index + 1 < queueLength,
    hasPrevious: index > 0,
  }
}

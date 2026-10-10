"use client"

/* ================================================================== *
 * useReadAloud — the thin React wrapper around ReadAloudController
 * (lib/knowledge/read-aloud.ts). All the real state-machine logic
 * lives there, isolated and unit-tested with no DOM; this hook only
 * exists to give the Reader real React state and a stable set of
 * controls, and to guarantee cleanup on unmount / item change.
 * ================================================================== */

import { useEffect, useRef, useState } from "react"
import {
  DEFAULT_READ_ALOUD_RATE,
  getDefaultLang,
  getSpeechEngine,
  loadReadAloudRate,
  messageForReadAloudState,
  persistReadAloudRate,
  ReadAloudController,
  type ReadAloudRate,
  type ReadAloudState,
} from "./read-aloud"
import { getVoiceSource, VoiceDiscovery } from "./voice-discovery"

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
  /** Current narration speed, and the setter that also remembers it
   *  for next time. Changing it while playing restarts the current
   *  paragraph — see ReadAloudController.setRate. */
  rate: ReadAloudRate
  setRate: (rate: ReadAloudRate) => void
  /** Index of the paragraph currently being narrated, into the same
   *  array passed in — what the Reader needs to mark it. Meaningful
   *  only while state is "playing" or "paused"; it reads 0 at rest,
   *  which is why the Reader gates on the state, not on this. */
  paragraphIndex: number
}

/** `id` keys the controller's lifetime — pass the document's own id.
 *  Reading a NEW document (id changes) tears down any in-progress
 *  speech and starts a fresh controller over the new paragraphs;
 *  simply re-rendering with the same id (a new `paragraphs` array
 *  reference from the same content) does not interrupt playback. */
export function useReadAloud(id: string, paragraphs: string[], lang?: string): UseReadAloudResult {
  const [state, setState] = useState<ReadAloudState>("idle")
  const [index, setIndex] = useState(0)
  const [paragraphIndex, setParagraphIndex] = useState(0)
  /* Lazy initialiser: localStorage is read once, on mount, never on
   * every render — and never during SSR, where it does not exist. */
  const [rate, setRateState] = useState<ReadAloudRate>(() => loadReadAloudRate())
  const [queueLength, setQueueLength] = useState(0)
  const controllerRef = useRef<ReadAloudController | null>(null)

  const paragraphsRef = useRef(paragraphs)
  paragraphsRef.current = paragraphs
  const langRef = useRef(lang)
  langRef.current = lang
  /* Read inside the id-keyed effect, which must not re-run on a speed
   * change — restarting speech because someone picked 1.25x would be
   * a worse bug than the one this fixes. */
  const rateRef = useRef(rate)
  rateRef.current = rate

  /* Voice discovery lives for as long as this hook does, not for as
   * long as one article does: the browser's voice list belongs to the
   * page, and re-reading it on every article change would add
   * listeners for nothing. Its own effect, with its own cleanup, so
   * React Strict Mode's double-invoke disposes exactly what it
   * created. */
  const discoveryRef = useRef<VoiceDiscovery | null>(null)
  useEffect(() => {
    const discovery = new VoiceDiscovery(getVoiceSource())
    discoveryRef.current = discovery
    return () => {
      discovery.dispose()
      if (discoveryRef.current === discovery) discoveryRef.current = null
    }
  }, [])

  useEffect(() => {
    // Captured by the index callback below, which needs the instance
    // before `controllerRef` has been assigned. Reading the ref there
    // would work today only because nothing calls onIndexChange from
    // the constructor — a dependency on construction order that this
    // local removes.
    let self: ReadAloudController | null = null
    /* The engine handed to the controller answers getVoices() from
     * the discovery instance. The controller asks at speak time, so a
     * list that fills in later is used by the NEXT paragraph and
     * nothing restarts — the invariant that a voice update must never
     * disturb playback is structural here, not a rule to remember. */
    const base = getSpeechEngine()
    const engine = base && {
      ...base,
      synth: {
        ...base.synth,
        speak: (u: Parameters<typeof base.synth.speak>[0]) => base.synth.speak(u),
        cancel: () => base.synth.cancel(),
        pause: () => base.synth.pause(),
        resume: () => base.synth.resume(),
        getVoices: () => discoveryRef.current?.getVoices() ?? [],
      },
    }

    const controller = new ReadAloudController(
      paragraphsRef.current,
      langRef.current ?? getDefaultLang(),
      engine,
      setState,
      (queueIndex) => {
        setIndex(queueIndex)
        // The controller owns the queue→paragraph map, so it is the
        // one thing that can answer this without duplicating the
        // splitting rules here.
        setParagraphIndex(self?.getParagraphIndex() ?? queueIndex)
      },
    )
    self = controller
    controllerRef.current = controller
    // A new controller starts at the default; carry the reader's
    // chosen speed across an article change.
    if (rateRef.current !== DEFAULT_READ_ALOUD_RATE) controller.setRate(rateRef.current)
    setState(controller.getState())
    setIndex(0)
    setParagraphIndex(0)
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
    rate,
    setRate: (next: ReadAloudRate) => {
      setRateState(next)
      persistReadAloudRate(next)
      controllerRef.current?.setRate(next)
    },
    paragraphIndex,
  }
}

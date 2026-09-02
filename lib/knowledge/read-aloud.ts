/* ================================================================== *
 * READ ALOUD — a browser capability, not a TTS product.
 *
 * The Reader already extracts the article body into paragraphs (see
 * paragraphs() in components/knowledge/reader-view.tsx). Read Aloud's
 * entire job is to speak those exact paragraphs, one at a time, using
 * the browser's own window.speechSynthesis — nothing here talks to a
 * server, sends text anywhere, stores audio, or invents content that
 * wasn't already in the extracted body.
 *
 * Isolated from React entirely, on purpose — same reasoning as
 * lib/knowledge/voice-search.ts: no component-rendering test harness
 * exists in this repo, and SpeechSynthesis does not exist in Node at
 * all. ReadAloudController is a plain class that takes an injectable
 * speech engine (synth + an utterance factory) and drives real state
 * transitions off real utterance events — tests give it a FAKE engine
 * and assert on the transitions, with no DOM and no React involved.
 * lib/knowledge/use-read-aloud.ts is the thin React wrapper that only
 * exists to expose this to the Reader.
 * ================================================================== */

export type ReadAloudState =
  | "idle"
  | "playing"
  | "paused"
  | "stopped"
  | "unsupported"
  | "unavailable"
  | "error"

/** The minimal shape of a real SpeechSynthesisUtterance this
 *  controller actually uses — small enough that the browser's real
 *  SpeechSynthesisUtterance satisfies it as-is, and a test's fake
 *  object can implement it with no DOM. */
export interface SpeechSynthesisUtteranceLike {
  text: string
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

/** The minimal shape of window.speechSynthesis this controller uses. */
export interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtteranceLike): void
  cancel(): void
  pause(): void
  resume(): void
}

export interface SpeechEngine {
  synth: SpeechSynthesisLike
  /** Builds one utterance for a chunk of text — the controller sets
   *  .lang itself right after, matching how the real
   *  SpeechSynthesisUtterance constructor only takes text. */
  makeUtterance: (text: string) => SpeechSynthesisUtteranceLike
}

/** Finds the browser's real speechSynthesis + SpeechSynthesisUtterance,
 *  or undefined when either is missing: any non-browser environment
 *  (including this test suite's plain Node), and any browser that
 *  simply doesn't implement the Web Speech synthesis API. undefined
 *  here is the ONE signal the rest of this module needs to degrade to
 *  "unsupported" — never a browser sniff, never a guess. */
export function getSpeechEngine(): SpeechEngine | undefined {
  if (typeof window === "undefined") return undefined
  type UtteranceCtor = new (text: string) => SpeechSynthesisUtteranceLike
  const w = window as unknown as {
    speechSynthesis?: SpeechSynthesisLike
    SpeechSynthesisUtterance?: UtteranceCtor
  }
  if (!w.speechSynthesis || !w.SpeechSynthesisUtterance) return undefined
  const synth = w.speechSynthesis
  const Utterance = w.SpeechSynthesisUtterance
  return { synth, makeUtterance: (text) => new Utterance(text) }
}

/** No real language metadata exists on a KnowledgeDocument today (no
 *  DB column, and adding one is out of this commit's scope — no
 *  migrations). So there is no "confiável" document-level signal to
 *  reuse; the honest fallback is the reader's own browser locale,
 *  exactly like voice-search.ts's recognition.lang fallback. A future
 *  commit that adds real extracted-language metadata can pass it in
 *  as the controller's `lang` and this fallback simply stops being
 *  reached. */
export function getDefaultLang(): string {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US"
}

/** The exact short copy for a state that needs to say something —
 *  playing/paused/stopped/idle show themselves through the controls
 *  themselves, not a message string. */
export function messageForReadAloudState(state: ReadAloudState): string | null {
  switch (state) {
    case "unsupported":
      return "Read Aloud isn't supported in this browser."
    case "unavailable":
      return "Read Aloud isn't available for this content."
    case "error":
      return "Read Aloud couldn't continue. Try again."
    default:
      return null
  }
}

/** Splits one paragraph into safe chunks no longer than maxChars,
 *  breaking only on whitespace — never mid-word — and only when the
 *  paragraph actually exceeds the limit. Deliberately not a "parser":
 *  no sentence detection, no punctuation awareness, just a length
 *  guard so one abnormally large paragraph can't become a single
 *  multi-minute utterance nothing can pause/skip mid-way through. */
function splitLongParagraph(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      chunks.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/** Builds the real speech queue from the Reader's extracted
 *  paragraphs: one unit per paragraph, except an oversized paragraph
 *  is safely split into more than one unit. Next/Previous navigate
 *  this queue — for the overwhelming majority of real articles (no
 *  paragraph anywhere near maxChars) that is exactly paragraph-level
 *  navigation, exactly as specified. */
export function buildSpeechQueue(paragraphs: string[], maxChars = 1000): string[] {
  return paragraphs.flatMap((p) => splitLongParagraph(p, maxChars))
}

/**
 * The real state machine. One utterance per queue unit, spoken in
 * order; pause/resume operate on the browser's own mid-utterance
 * pause (real cross-browser behavior for SpeechSynthesis), and
 * next/previous cancel the current utterance and start the adjacent
 * one. A monotonic `generation` counter guards every callback a
 * cancelled/superseded utterance can still fire — see stop()/next()/
 * previous() — so a stale onend/onerror from an utterance this
 * controller has already moved past can never corrupt current state.
 */
export class ReadAloudController {
  // Plain fields assigned in the constructor body, not TS "parameter
  // property" shorthand — this repo's test runner uses Node's
  // --experimental-strip-types (type-erasure only, no real transform),
  // which does not support that syntax sugar. See voice-search.ts for
  // the same note; keeping the convention consistent across this
  // directory.
  private readonly queue: string[]
  private readonly lang: string
  private readonly engine: SpeechEngine | undefined
  private readonly onStateChange: (state: ReadAloudState) => void
  private readonly onIndexChange: (index: number) => void
  private state: ReadAloudState
  private index = 0
  private generation = 0

  constructor(
    paragraphs: string[],
    lang: string,
    engine: SpeechEngine | undefined,
    onStateChange: (state: ReadAloudState) => void,
    onIndexChange: (index: number) => void,
  ) {
    this.queue = buildSpeechQueue(paragraphs)
    this.lang = lang
    this.engine = engine
    this.onStateChange = onStateChange
    this.onIndexChange = onIndexChange
    this.state = !engine ? "unsupported" : this.queue.length === 0 ? "unavailable" : "idle"
  }

  getState(): ReadAloudState {
    return this.state
  }

  getIndex(): number {
    return this.index
  }

  getQueueLength(): number {
    return this.queue.length
  }

  private setState(state: ReadAloudState): void {
    this.state = state
    this.onStateChange(state)
  }

  private setIndex(index: number): void {
    this.index = index
    this.onIndexChange(index)
  }

  /** Speaks the unit at the current index, advancing to the next one
   *  on its natural end — the actual "queue" behavior: one utterance
   *  at a time, never the whole article as one utterance. */
  private speakCurrent(): void {
    if (!this.engine) return
    if (this.index >= this.queue.length) {
      // Reached the end of the article — a natural finish, not a stop
      // the user asked for, but the resting state is the same one.
      this.generation++
      this.index = 0
      this.setIndex(0)
      this.setState("stopped")
      return
    }

    this.generation++
    const gen = this.generation
    const utterance = this.engine.makeUtterance(this.queue[this.index])
    utterance.lang = this.lang

    utterance.onstart = () => {
      if (gen !== this.generation) return
      this.setState("playing")
    }
    utterance.onend = () => {
      if (gen !== this.generation) return
      this.setIndex(this.index + 1)
      this.speakCurrent()
    }
    utterance.onerror = (event) => {
      if (gen !== this.generation) return
      // Our own cancel() calls (next/previous/stop) surface as an
      // "interrupted"/"canceled" error on the outgoing utterance in
      // every real engine — that is expected control flow, not a
      // real failure, and must never flip the UI into an error state.
      if (event.error === "interrupted" || event.error === "canceled") return
      this.setState("error")
    }

    this.engine.synth.speak(utterance)
  }

  /** Starts reading from the first queue unit. A no-op while already
   *  playing (duplicate-play guard — a second click can't start a
   *  second, overlapping reading), and defers to resume() while
   *  paused rather than restarting from the top. */
  play(): void {
    if (this.state === "unsupported" || this.state === "unavailable") return
    if (this.state === "playing") return
    if (this.state === "paused") {
      this.resume()
      return
    }
    this.setIndex(0)
    this.speakCurrent()
  }

  /** speechSynthesis.pause() — pauses the CURRENT utterance in place;
   *  a real, cross-browser mid-utterance pause, not a cancel. */
  pause(): void {
    if (this.state !== "playing") return
    this.engine?.synth.pause()
    this.setState("paused")
  }

  /** speechSynthesis.resume() — continues the same utterance that was
   *  paused, from where the engine left off. */
  resume(): void {
    if (this.state !== "paused") return
    this.engine?.synth.resume()
    this.setState("playing")
  }

  /** speechSynthesis.cancel() — a hard stop. Clears the queue
   *  position back to the start and any pending utterance, and bumps
   *  `generation` FIRST so a synchronously-firing onend/onerror from
   *  the cancelled utterance can never be mistaken for real progress
   *  on what comes next. */
  stop(): void {
    if (this.state === "unsupported" || this.state === "unavailable") return
    if (this.state === "idle" || this.state === "stopped") return
    this.generation++
    this.engine?.synth.cancel()
    this.setIndex(0)
    this.setState("stopped")
  }

  /** Cancels the current utterance and starts the next queue unit.
   *  A no-op past the last unit — no seek beyond the article's end. */
  next(): void {
    if (this.state !== "playing" && this.state !== "paused") return
    if (this.index + 1 >= this.queue.length) return
    this.generation++
    this.engine?.synth.cancel()
    this.setIndex(this.index + 1)
    this.speakCurrent()
  }

  /** Cancels the current utterance and restarts the previous queue
   *  unit from its beginning. A no-op at the first unit. */
  previous(): void {
    if (this.state !== "playing" && this.state !== "paused") return
    if (this.index <= 0) return
    this.generation++
    this.engine?.synth.cancel()
    this.setIndex(this.index - 1)
    this.speakCurrent()
  }
}

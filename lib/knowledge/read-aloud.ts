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

import { selectVoice, type SpeechSynthesisVoiceLike } from "./voice-selection"

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
  /** Optional so the existing suite's fake utterance still satisfies
   *  this interface unchanged. The real SpeechSynthesisUtterance
   *  always has it; a fake that ignores it simply never asserts on
   *  playback speed. */
  rate?: number
  /** The chosen voice, when one matched the article's language (see
   *  voice-selection.ts). Left unset when nothing matched, which lets
   *  the engine fall back to its own default for `lang` — a better
   *  outcome than naming a voice in the wrong language. */
  voice?: SpeechSynthesisVoiceLike | null
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

/** The minimal shape of window.speechSynthesis this controller uses. */
export interface SpeechSynthesisLike {
  /** Optional, and read at speak time rather than held as state.
   *
   *  That timing is the whole design: Safari's list arrives late (see
   *  voice-discovery.ts), so asking just before each utterance picks
   *  up voices that appeared since the last paragraph — WITHOUT the
   *  controller holding voice state, and therefore without any path
   *  by which a voice update could restart, skip or rewind playback.
   *  An engine that cannot answer simply yields no voice. */
  getVoices?(): SpeechSynthesisVoiceLike[]
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

/* ---- playback speed ------------------------------------------------ *
 *
 * A closed set, not a free number. SpeechSynthesisUtterance.rate
 * accepts anything from 0.1 to 10, and the far ends are unusable
 * noise; offering five steps is a product decision, and validating
 * against them is what keeps a corrupted stored value from producing
 * speech nobody can follow.
 * ------------------------------------------------------------------ */

export const READ_ALOUD_RATES = [0.75, 1, 1.25, 1.5, 2] as const
export type ReadAloudRate = (typeof READ_ALOUD_RATES)[number]
export const DEFAULT_READ_ALOUD_RATE: ReadAloudRate = 1

/** Versioned, like the guest store's key: a future change to the set
 *  of speeds must not inherit a value from the old one. */
export const READ_ALOUD_RATE_KEY = "knowledge.readaloud.rate.v1"

export function isReadAloudRate(value: unknown): value is ReadAloudRate {
  return typeof value === "number" && (READ_ALOUD_RATES as readonly number[]).includes(value)
}

/**
 * The reader's stored speed, or the default.
 *
 * Every failure mode lands on the default rather than throwing:
 * private mode denies localStorage, the value may be absent, may be
 * text, or may be a number that is no longer one of the offered
 * speeds. None of those is worth breaking Read Aloud over.
 */
export function loadReadAloudRate(storage?: Pick<Storage, "getItem">): ReadAloudRate {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined)
    if (!store) return DEFAULT_READ_ALOUD_RATE
    const parsed = Number(store.getItem(READ_ALOUD_RATE_KEY))
    return isReadAloudRate(parsed) ? parsed : DEFAULT_READ_ALOUD_RATE
  } catch {
    return DEFAULT_READ_ALOUD_RATE
  }
}

/** Best-effort. A preference that cannot be stored is not an error
 *  worth surfacing — the session simply keeps the speed in memory. */
export function persistReadAloudRate(rate: ReadAloudRate, storage?: Pick<Storage, "setItem">): void {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined)
    store?.setItem(READ_ALOUD_RATE_KEY, String(rate))
  } catch {
    /* quota, private mode, blocked site data */
  }
}

/** The fallback when the ARTICLE declares no language of its own.
 *
 *  It used to be the only path: extract.ts read <html lang>, repo.ts
 *  stored it in the `lang` column, and the value then stopped at
 *  adapter.ts, which never carried it onto KnowledgeDocument. Every
 *  article was therefore narrated in the reader's browser locale, so
 *  a Portuguese page opened in an en-US browser was read by an
 *  English voice.
 *
 *  The document's own `lang` now reaches the controller and takes
 *  precedence. This remains correct for the pages that genuinely
 *  declare nothing — guessing a language from the text would be
 *  inventing metadata the page never provided. */
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
 * Which PARAGRAPH each queue unit came from: result[queueIndex] is an
 * index into the original `paragraphs` array.
 *
 * The two are not the same number, and assuming they were is the easy
 * way to highlight the wrong paragraph. buildSpeechQueue flatMaps, so
 * a paragraph longer than maxChars becomes several utterances and
 * every later unit is offset by the extra ones. A 3-paragraph article
 * whose first paragraph splits in three has a 5-unit queue, and queue
 * unit 3 belongs to paragraph 1, not paragraph 3.
 *
 * Built by the same traversal as the queue, from the same splitter, so
 * the two cannot drift apart.
 */
export function buildParagraphIndexMap(paragraphs: string[], maxChars = 1000): number[] {
  const map: number[] = []
  paragraphs.forEach((p, paragraphIndex) => {
    for (let i = 0; i < splitLongParagraph(p, maxChars).length; i += 1) {
      map.push(paragraphIndex)
    }
  })
  return map
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
  /** queueIndex → paragraph index; see buildParagraphIndexMap. */
  private readonly paragraphMap: number[]
  private rate: ReadAloudRate = DEFAULT_READ_ALOUD_RATE
  /** Set when the rate changed while PAUSED, so resume() knows the
   *  current utterance is stale. Cleared in speakCurrent(), the one
   *  place a fresh utterance is built at the current rate. */
  private pendingRateRestart = false
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
    this.paragraphMap = buildParagraphIndexMap(paragraphs)
    this.lang = lang
    this.engine = engine
    this.onStateChange = onStateChange
    this.onIndexChange = onIndexChange
    this.state = !engine ? "unsupported" : this.queue.length === 0 ? "unavailable" : "idle"
  }

  /** The paragraph being narrated, as an index into the paragraphs
   *  this controller was built from — what a UI needs to highlight it.
   *  Falls back to the queue index only if the map is somehow shorter,
   *  which cannot happen while both come from the same traversal. */
  getParagraphIndex(): number {
    return this.paragraphMap[this.index] ?? this.index
  }

  getRate(): ReadAloudRate {
    return this.rate
  }

  /**
   * Change the narration speed.
   *
   * The Web Speech API fixes an utterance's rate when it is created —
   * there is no way to retune one already being spoken. So a change
   * while playing cancels the current unit and speaks it again at the
   * new rate, which restarts the current paragraph rather than the
   * article. That is the honest trade: the alternative is a control
   * that silently does nothing until the next paragraph.
   *
   * While idle, paused or stopped it only records the value, so it
   * applies to whatever is spoken next.
   */
  setRate(rate: ReadAloudRate): void {
    if (rate === this.rate) return
    this.rate = rate
    if (this.state === "playing") {
      // speakCurrent() bumps the generation itself, which is what
      // makes the cancelled utterance's late onend/onerror a no-op.
      this.engine?.synth.cancel()
      this.speakCurrent()
      return
    }
    if (this.state === "paused") {
      // DO NOT speak here. speak() starts audio immediately, so
      // cancelling and re-speaking would turn "change the speed" into
      // "un-pause" — a worse bug than the one this fixes. The reader
      // asked to change a setting, not to resume.
      //
      // Instead record that the paused utterance is now stale. It is
      // still mid-paragraph at the OLD rate, and the Web Speech API
      // cannot retune an utterance that already exists, so the only
      // way to honour the choice is to build a new one — which
      // resume() does, at the moment the reader actually asks for
      // audio.
      this.pendingRateRestart = true
    }
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
    // Whatever was pending is satisfied the moment a new utterance is
    // built at the current rate — however we got here (play, next,
    // previous, a rate change while playing, or resume's restart).
    this.pendingRateRestart = false
    const utterance = this.engine.makeUtterance(this.queue[this.index])
    // lang is set from the ARTICLE, always and unconditionally. It is
    // not derived from the voice: a voice is a preference, the
    // language is a fact about the text, and an engine that ignores
    // our voice still needs to be told what it is reading.
    utterance.lang = this.lang
    utterance.rate = this.rate

    // Asked per utterance, never cached on this instance — see
    // SpeechSynthesisLike.getVoices for why that timing matters.
    const match = selectVoice(this.lang, this.engine.synth.getVoices?.())
    if (match.voice) utterance.voice = match.voice

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

    if (this.pendingRateRestart && this.engine) {
      // The paused utterance was built at the previous rate and
      // cannot be retuned, so it is replaced. The current paragraph
      // restarts from its beginning — the same trade setRate() makes
      // while playing, and the only one the API allows.
      //
      // THE ORDER IS LOAD-BEARING, and it is why this is not simply
      // cancel() + speak():
      //   cancel() first, so the outgoing utterance never becomes
      //     audible again at the old rate;
      //   resume() second, because the engine holds a GLOBAL paused
      //     flag that cancel() does not reliably clear — Chrome and
      //     Safari differ — and an utterance spoken while that flag
      //     is set may never start at all, which would read as Read
      //     Aloud silently dying;
      //   speakCurrent() last, which bumps the generation and so
      //     makes the cancelled utterance's late onend/onerror inert.
      this.engine.synth.cancel()
      this.engine.synth.resume()
      this.speakCurrent()
      return
    }

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
    this.pendingRateRestart = false
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

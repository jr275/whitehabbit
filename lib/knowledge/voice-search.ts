/* ================================================================== *
 * VOICE SEARCH — a browser capability, not a new search engine.
 *
 * The Library's search is already just a React state string (`query`)
 * with a debounced effect that fires the real search whenever it
 * changes — see library-view.tsx. Voice search's entire job is:
 * transcript → setQuery(transcript). Nothing here talks to a server,
 * stores audio, or runs continuously; it drives the browser's own
 * Web Speech API (SpeechRecognition) for one utterance at a time, the
 * same shape as clicking into the box and typing, just by voice.
 *
 * Isolated from React entirely, on purpose: this repo has no
 * component-rendering test harness (see tests/knowledge/
 * cover-images.test.ts's own header for why one is not worth adding
 * for a single capability), and SpeechRecognition does not exist in
 * Node at all. VoiceSearchController is a plain class that takes an
 * injectable "make me a recognizer" factory and drives real state
 * transitions off real event callbacks — tests give it a FAKE
 * recognizer object and assert on the transitions, with no DOM and no
 * React involved. lib/knowledge/use-voice-search.ts is the thin React
 * wrapper that only exists to expose this to a component.
 * ================================================================== */

export type VoiceSearchState =
  | "idle"
  | "requesting"
  | "listening"
  | "processing"
  | "success"
  | "permission-denied"
  | "unsupported"
  | "error"

/** The minimal shape of the Web Speech API's SpeechRecognition this
 *  controller actually uses — small enough that a real browser's
 *  SpeechRecognition/webkitSpeechRecognition satisfies it as-is, and a
 *  test's fake object can implement it with no DOM. */
export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export interface SpeechRecognitionErrorEventLike {
  error: string
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike

/** Finds the browser's real SpeechRecognition constructor — standard
 *  or the still-common webkit-prefixed one (Safari) — and returns a
 *  small factory for it, or undefined when neither exists: Firefox,
 *  most non-Chromium/non-WebKit browsers, and any non-browser
 *  environment (including this test suite's plain Node). undefined
 *  here is the ONE signal the rest of this module needs to degrade to
 *  "unsupported" — never a browser sniff, never a guess. */
export function getSpeechRecognitionFactory(): SpeechRecognitionFactory | undefined {
  if (typeof window === "undefined") return undefined
  type SpeechRecognitionCtor = new () => SpeechRecognitionLike
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? () => new Ctor() : undefined
}

/** Error codes the Web Speech API uses for a real, user-facing
 *  permission refusal — everything else (no-speech, audio-capture,
 *  network, aborted, ...) is the generic "couldn't be completed"
 *  case. Named here once so the mapping is a real fact, not repeated
 *  string literals scattered through the controller. */
const PERMISSION_ERROR_CODES = new Set(["not-allowed", "service-not-allowed"])

/** The exact short copy for each state that needs to say something —
 *  idle/requesting/listening/processing/success show themselves
 *  through the mic button's own appearance, not a message string. */
export function messageForState(state: VoiceSearchState): string | null {
  switch (state) {
    case "permission-denied":
      return "Microphone permission is required for voice search."
    case "unsupported":
      return "Voice search isn't supported in this browser. You can still search by typing."
    case "error":
      return "Voice search couldn't be completed. Try again."
    default:
      return null
  }
}

/**
 * The real state machine. One utterance per start(): continuous is
 * always false (no continuous listening, no wake word — a dictation
 * button, exactly as scoped), interimResults is always true so a
 * caller MAY show live partial text, but a search is only ever fired
 * once, from the FINAL transcript — interim results never call
 * onFinalTranscript, so the existing debounced search never gets
 * triggered once per word.
 */
export class VoiceSearchController {
  // Plain fields assigned in the constructor body, not TS "parameter
  // property" shorthand: this repo's test runner uses Node's
  // --experimental-strip-types (type-erasure only, no real transform —
  // see tests/helpers/register-alias.mjs), which does not support
  // that syntax sugar since expanding it into field assignments is a
  // real code transformation, not just stripping types.
  private readonly factory: SpeechRecognitionFactory | undefined
  private readonly onStateChange: (state: VoiceSearchState, interimTranscript: string) => void
  private readonly onFinalTranscript: (transcript: string) => void
  private recognition: SpeechRecognitionLike | null = null
  private state: VoiceSearchState

  constructor(
    factory: SpeechRecognitionFactory | undefined,
    onStateChange: (state: VoiceSearchState, interimTranscript: string) => void,
    onFinalTranscript: (transcript: string) => void,
  ) {
    this.factory = factory
    this.onStateChange = onStateChange
    this.onFinalTranscript = onFinalTranscript
    this.state = factory ? "idle" : "unsupported"
  }

  getState(): VoiceSearchState {
    return this.state
  }

  private setState(state: VoiceSearchState, interimTranscript = ""): void {
    this.state = state
    this.onStateChange(state, interimTranscript)
  }

  /** Starts one capture. A no-op while already requesting/listening —
   *  starting twice is not "restart", it's ignored, so a double click
   *  can't leave two recognizers racing each other. */
  start(): void {
    if (!this.factory) {
      this.setState("unsupported")
      return
    }
    if (this.state === "requesting" || this.state === "listening") return

    this.setState("requesting")
    const recognition = this.factory()
    recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US"
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onstart = () => this.setState("listening")

    recognition.onresult = (event) => {
      let finalTranscript = ""
      let interimTranscript = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ""
        if (result.isFinal) finalTranscript += text
        else interimTranscript += text
      }
      const finalTrimmed = finalTranscript.trim()
      if (finalTrimmed) {
        // Exactly one dispatch per utterance — never once per interim word.
        this.setState("processing", finalTrimmed)
        this.onFinalTranscript(finalTrimmed)
        this.setState("success", finalTrimmed)
      } else {
        this.setState("listening", interimTranscript)
      }
    }

    recognition.onerror = (event) => {
      this.setState(PERMISSION_ERROR_CODES.has(event.error) ? "permission-denied" : "error")
    }

    recognition.onend = () => {
      // The browser ends the session on its own once a final result
      // lands (or on silence/cancel). Only fall back to idle if
      // nothing else already gave this a real outcome — a success or
      // an error must never be quietly overwritten by onend running
      // after them.
      if (this.state === "listening" || this.state === "requesting") this.setState("idle")
    }

    this.recognition = recognition
    try {
      recognition.start()
    } catch {
      // A real browser can throw synchronously (e.g. calling start()
      // while a previous instance is still tearing down) — treated
      // the same as any other capture failure, never a silent no-op.
      this.setState("error")
    }
  }

  /** Stops an in-progress capture — the "cancel" affordance. Lets the
   *  real onend fire and fall back to idle, rather than forcing a
   *  state here and risking a late event overwriting it. */
  stop(): void {
    if (this.recognition && (this.state === "listening" || this.state === "requesting")) {
      this.recognition.stop()
    }
  }

  /** Returns to idle from a terminal state (success/error/permission-
   *  denied) once the caller is done showing it — never overrides
   *  "unsupported", which is a real, static browser fact. */
  reset(): void {
    if (this.state !== "unsupported" && this.state !== "listening" && this.state !== "requesting") {
      this.setState("idle")
    }
  }
}

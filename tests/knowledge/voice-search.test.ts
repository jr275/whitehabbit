/* ================================================================== *
 * VOICE SEARCH — lib/knowledge/voice-search.ts's real state machine,
 * driven with a FAKE SpeechRecognition. No DOM, no React, no browser:
 * SpeechRecognition does not exist in Node at all, and this repo has
 * no component-rendering harness (see tests/knowledge/cover-images.
 * test.ts's own header for why one isn't worth adding for this). The
 * controller was built specifically to be testable without either —
 * these tests exercise the real class, not a re-implementation of it.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  getSpeechRecognitionFactory,
  messageForState,
  VoiceSearchController,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
  type VoiceSearchState,
} from "@/lib/knowledge/voice-search"

/** A real, minimal SpeechRecognitionLike implementation — not a mock
 *  of the controller's expectations, an object shaped exactly like a
 *  browser's, that a test drives by calling the SAME callbacks a real
 *  browser would (onstart/onresult/onerror/onend). */
class FakeRecognition implements SpeechRecognitionLike {
  lang = ""
  continuous = false
  interimResults = false
  startCalls = 0
  stopCalls = 0
  onstart: (() => void) | null = null
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null = null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null
  onend: (() => void) | null = null

  start() {
    this.startCalls++
  }
  stop() {
    this.stopCalls++
  }
}

function resultEvent(entries: { transcript: string; isFinal: boolean }[]): SpeechRecognitionResultEventLike {
  return {
    resultIndex: 0,
    results: entries.map((e) => Object.assign([{ transcript: e.transcript }], { isFinal: e.isFinal })),
  }
}

/** Drives a controller + its one FakeRecognition together, recording
 *  every (state, interimTranscript) transition and every final
 *  transcript dispatched — so a test can assert on the real sequence,
 *  not just the last value. */
function harness() {
  let recognition: FakeRecognition | null = null
  const transitions: { state: VoiceSearchState; interim: string }[] = []
  const finalTranscripts: string[] = []

  const controller = new VoiceSearchController(
    () => {
      recognition = new FakeRecognition()
      return recognition
    },
    (state, interim) => transitions.push({ state, interim }),
    (transcript) => finalTranscripts.push(transcript),
  )

  return {
    controller,
    transitions,
    finalTranscripts,
    recognition: () => recognition as FakeRecognition | null,
  }
}

describe("VoiceSearchController — unsupported browser", () => {
  it("starts in 'unsupported' when no factory is available, and start() never creates a recognizer or fires onFinalTranscript", () => {
    const transitions: { state: VoiceSearchState; interim: string }[] = []
    const finalTranscripts: string[] = []
    const controller = new VoiceSearchController(undefined, (state, interim) => transitions.push({ state, interim }), (t) => finalTranscripts.push(t))

    assert.equal(controller.getState(), "unsupported")
    controller.start()
    assert.equal(controller.getState(), "unsupported")
    assert.deepEqual(finalTranscripts, [])
    // start() on an unsupported browser still reports the state (so a
    // UI relying only on onStateChange, not the initial getState(),
    // still shows the right thing after a click).
    assert.ok(transitions.some((t) => t.state === "unsupported"))
  })

  it("reset() never overrides 'unsupported' — it is a real, static browser fact, not a transient result", () => {
    const controller = new VoiceSearchController(undefined, () => {}, () => {})
    controller.reset()
    assert.equal(controller.getState(), "unsupported")
  })
})

describe("VoiceSearchController — start / listening", () => {
  it("start() goes requesting immediately, then listening once the recognizer's onstart fires", () => {
    const h = harness()
    h.controller.start()
    assert.equal(h.controller.getState(), "requesting")
    assert.equal(h.recognition()!.startCalls, 1)

    h.recognition()!.onstart!()
    assert.equal(h.controller.getState(), "listening")
    assert.deepEqual(
      h.transitions.map((t) => t.state),
      ["requesting", "listening"],
    )
  })

  it("configures the recognizer for one dictation, never continuous listening, never a wake word", () => {
    const h = harness()
    h.controller.start()
    assert.equal(h.recognition()!.continuous, false, "continuous must be false — one utterance, not always-on capture")
    assert.equal(h.recognition()!.interimResults, true, "interim results are allowed for live display only")
  })

  it("a second start() while already listening/requesting is a no-op — no second recognizer, no restart", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()
    const first = h.recognition()
    h.controller.start()
    assert.equal(h.recognition(), first, "no new recognizer was created")
    assert.equal(first!.startCalls, 1, "start() was not called again on the recognizer")
  })
})

describe("VoiceSearchController — interim vs. final transcript", () => {
  it("interim results update the live transcript but NEVER dispatch a search — no per-word firing", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()

    h.recognition()!.onresult!(resultEvent([{ transcript: "artificial", isFinal: false }]))
    assert.equal(h.controller.getState(), "listening")
    assert.deepEqual(h.finalTranscripts, [], "an interim result must never call onFinalTranscript")

    h.recognition()!.onresult!(resultEvent([{ transcript: "artificial intelligence", isFinal: false }]))
    assert.deepEqual(h.finalTranscripts, [])
  })

  it("a final result fires onFinalTranscript EXACTLY ONCE with the trimmed text, and moves processing → success", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()
    h.recognition()!.onresult!(resultEvent([{ transcript: "  artificial intelligence in healthcare  ", isFinal: true }]))

    assert.deepEqual(h.finalTranscripts, ["artificial intelligence in healthcare"])
    assert.equal(h.controller.getState(), "success")
    assert.deepEqual(
      h.transitions.map((t) => t.state),
      ["requesting", "listening", "processing", "success"],
    )
  })

  it("combines multiple final segments from one result event into one dispatch", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()
    h.recognition()!.onresult!(
      resultEvent([
        { transcript: "artificial intelligence ", isFinal: true },
        { transcript: "in healthcare", isFinal: true },
      ]),
    )
    assert.deepEqual(h.finalTranscripts, ["artificial intelligence in healthcare"])
  })

  it("an all-whitespace/empty final segment is treated as no result — never dispatches an empty search", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()
    h.recognition()!.onresult!(resultEvent([{ transcript: "   ", isFinal: true }]))
    assert.deepEqual(h.finalTranscripts, [])
    assert.equal(h.controller.getState(), "listening")
  })
})

describe("VoiceSearchController — stop / cancel", () => {
  it("stop() while listening calls the recognizer's stop(), and onend then falls back to idle", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()
    h.controller.stop()
    assert.equal(h.recognition()!.stopCalls, 1)

    // The real browser fires onend asynchronously after stop() — the
    // controller's job is to land on idle once it does.
    h.recognition()!.onend!()
    assert.equal(h.controller.getState(), "idle")
  })

  it("stop() while merely requesting (permission prompt still open) also cancels cleanly", () => {
    const h = harness()
    h.controller.start()
    h.controller.stop()
    assert.equal(h.recognition()!.stopCalls, 1)
  })

  it("stop() is a no-op once idle — nothing to cancel, no crash", () => {
    const h = harness()
    h.controller.stop()
    assert.equal(h.controller.getState(), "idle")
  })

  it("onend firing AFTER a real success must never overwrite it back to idle", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()
    h.recognition()!.onresult!(resultEvent([{ transcript: "hello", isFinal: true }]))
    assert.equal(h.controller.getState(), "success")
    h.recognition()!.onend!() // the browser's own end-of-session event, arriving late
    assert.equal(h.controller.getState(), "success", "a late onend must not clobber a real result")
  })
})

describe("VoiceSearchController — errors", () => {
  it("'not-allowed' and 'service-not-allowed' map to permission-denied, and never call onFinalTranscript", () => {
    for (const code of ["not-allowed", "service-not-allowed"]) {
      const h = harness()
      h.controller.start()
      h.recognition()!.onerror!({ error: code })
      assert.equal(h.controller.getState(), "permission-denied", code)
      assert.deepEqual(h.finalTranscripts, [])
    }
  })

  it("any other recognizer error code maps to the generic 'error' state", () => {
    for (const code of ["no-speech", "audio-capture", "network", "aborted", "language-not-supported"]) {
      const h = harness()
      h.controller.start()
      h.recognition()!.onerror!({ error: code })
      assert.equal(h.controller.getState(), "error", code)
    }
  })

  it("onend firing after an error must not clobber the error state back to idle", () => {
    const h = harness()
    h.controller.start()
    h.recognition()!.onerror!({ error: "network" })
    h.recognition()!.onend!()
    assert.equal(h.controller.getState(), "error")
  })

  it("a synchronous throw from the real recognizer's start() is caught and surfaced as 'error', never an uncaught exception", () => {
    const throwing: SpeechRecognitionLike = {
      lang: "",
      continuous: false,
      interimResults: false,
      start() {
        throw new Error("already started")
      },
      stop() {},
      onstart: null,
      onresult: null,
      onerror: null,
      onend: null,
    }
    const controller = new VoiceSearchController(() => throwing, () => {}, () => {})
    assert.doesNotThrow(() => controller.start())
    assert.equal(controller.getState(), "error")
  })
})

describe("VoiceSearchController — reset()", () => {
  it("returns success/error/permission-denied to idle", () => {
    for (const errorCode of ["not-allowed", "network"]) {
      const h = harness()
      h.controller.start()
      h.recognition()!.onerror!({ error: errorCode })
      h.controller.reset()
      assert.equal(h.controller.getState(), "idle", errorCode)
    }

    const h = harness()
    h.controller.start()
    h.recognition()!.onstart!()
    h.recognition()!.onresult!(resultEvent([{ transcript: "hi", isFinal: true }]))
    h.controller.reset()
    assert.equal(h.controller.getState(), "idle")
  })

  it("does nothing while actively listening or requesting — reset is not a cancel", () => {
    const h = harness()
    h.controller.start()
    h.controller.reset()
    assert.equal(h.controller.getState(), "requesting")
    h.recognition()!.onstart!()
    h.controller.reset()
    assert.equal(h.controller.getState(), "listening")
  })
})

describe("messageForState — exact, user-facing copy", () => {
  it("permission-denied", () => {
    assert.equal(messageForState("permission-denied"), "Microphone permission is required for voice search.")
  })
  it("unsupported", () => {
    assert.equal(messageForState("unsupported"), "Voice search isn't supported in this browser. You can still search by typing.")
  })
  it("error", () => {
    assert.equal(messageForState("error"), "Voice search couldn't be completed. Try again.")
  })
  it("every other state has no message — it shows through the button itself, not text", () => {
    for (const state of ["idle", "requesting", "listening", "processing", "success"] as const) {
      assert.equal(messageForState(state), null, state)
    }
  })
})

describe("getSpeechRecognitionFactory — real browser-capability detection", () => {
  it("returns undefined outside a browser (this test process has no window) — never throws, never guesses support", () => {
    assert.equal(typeof window, "undefined", "sanity check: this really is a non-browser environment")
    assert.equal(getSpeechRecognitionFactory(), undefined)
  })
})

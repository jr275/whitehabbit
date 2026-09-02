/* ================================================================== *
 * READ ALOUD — lib/knowledge/read-aloud.ts's real state machine,
 * driven with a FAKE speechSynthesis engine. No DOM, no React, no
 * browser: SpeechSynthesis does not exist in Node at all, and this
 * repo has no component-rendering harness (see tests/knowledge/
 * cover-images.test.ts's own header for why one isn't worth adding
 * for this — same reasoning as tests/knowledge/voice-search.test.ts).
 * These tests exercise the real ReadAloudController, not a
 * re-implementation of it.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildSpeechQueue,
  getSpeechEngine,
  messageForReadAloudState,
  ReadAloudController,
  type SpeechEngine,
  type SpeechSynthesisLike,
  type SpeechSynthesisUtteranceLike,
  type ReadAloudState,
} from "@/lib/knowledge/read-aloud"

/** A real, minimal SpeechSynthesisUtteranceLike — a test drives it by
 *  calling the SAME callbacks a real browser engine would
 *  (onstart/onend/onerror), not by asserting on a mock's expectations. */
class FakeUtterance implements SpeechSynthesisUtteranceLike {
  text: string
  lang = ""
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  // Plain field + constructor body, not TS parameter-property shorthand
  // — this repo's test runner (--experimental-strip-types) is
  // type-erasure only and cannot expand that syntax. See voice-search.ts.
  constructor(text: string) {
    this.text = text
  }
}

/** A real, minimal SpeechSynthesisLike — speak()/cancel()/pause()/
 *  resume() just record calls; the test fires the current utterance's
 *  own callbacks to simulate the engine's real async behavior. */
class FakeSynth implements SpeechSynthesisLike {
  speakCalls: FakeUtterance[] = []
  cancelCalls = 0
  pauseCalls = 0
  resumeCalls = 0
  speak(utterance: SpeechSynthesisUtteranceLike) {
    this.speakCalls.push(utterance as FakeUtterance)
  }
  cancel() {
    this.cancelCalls++
  }
  pause() {
    this.pauseCalls++
  }
  resume() {
    this.resumeCalls++
  }
}

/** Wires a controller + its one FakeSynth together, recording every
 *  state transition and index change so a test can assert on the
 *  real sequence, not just the last value. */
function harness(paragraphs: string[], lang = "en-US") {
  const synth = new FakeSynth()
  const engine: SpeechEngine = { synth, makeUtterance: (text) => new FakeUtterance(text) }
  const states: ReadAloudState[] = []
  const indices: number[] = []

  const controller = new ReadAloudController(
    paragraphs,
    lang,
    engine,
    (state) => states.push(state),
    (index) => indices.push(index),
  )

  return {
    controller,
    synth,
    states,
    indices,
    /** The utterance most recently passed to synth.speak(). */
    current: () => synth.speakCalls[synth.speakCalls.length - 1] as FakeUtterance | undefined,
  }
}

describe("ReadAloudController — unsupported browser", () => {
  it("starts in 'unsupported' when no engine is available, and play() never calls speak()", () => {
    const states: ReadAloudState[] = []
    const controller = new ReadAloudController(["hello"], "en-US", undefined, (s) => states.push(s), () => {})
    assert.equal(controller.getState(), "unsupported")
    controller.play()
    assert.equal(controller.getState(), "unsupported")
    assert.deepEqual(states, [])
  })

  it("messageForReadAloudState gives the exact required copy", () => {
    assert.equal(messageForReadAloudState("unsupported"), "Read Aloud isn't supported in this browser.")
    assert.equal(messageForReadAloudState("unavailable"), "Read Aloud isn't available for this content.")
    assert.equal(messageForReadAloudState("error"), "Read Aloud couldn't continue. Try again.")
    for (const s of ["idle", "playing", "paused", "stopped"] as const) {
      assert.equal(messageForReadAloudState(s), null, s)
    }
  })
})

describe("ReadAloudController — empty content", () => {
  it("starts in 'unavailable' when there are no paragraphs to read, and play() is a no-op", () => {
    const h = harness([])
    assert.equal(h.controller.getState(), "unavailable")
    h.controller.play()
    assert.equal(h.controller.getState(), "unavailable")
    assert.equal(h.synth.speakCalls.length, 0)
  })
})

describe("ReadAloudController — play", () => {
  it("play() speaks the first paragraph and moves to 'playing' once the utterance starts", () => {
    const h = harness(["First paragraph.", "Second paragraph."])
    h.controller.play()
    assert.equal(h.synth.speakCalls.length, 1)
    assert.equal(h.current()!.text, "First paragraph.")
    assert.equal(h.current()!.lang, "en-US")

    h.current()!.onstart!()
    assert.equal(h.controller.getState(), "playing")
  })

  it("a second play() while already playing is a no-op — no duplicate reading", () => {
    const h = harness(["First.", "Second."])
    h.controller.play()
    h.current()!.onstart!()
    const speakCallsBefore = h.synth.speakCalls.length

    h.controller.play()
    assert.equal(h.synth.speakCalls.length, speakCallsBefore, "no second speak() call")
    assert.equal(h.controller.getState(), "playing")
  })

  it("only the extracted body paragraphs are ever spoken — nothing else is invented", () => {
    const h = harness(["Only this.", "And this."])
    h.controller.play()
    assert.equal(h.current()!.text, "Only this.")
    h.current()!.onend!()
    assert.equal(h.current()!.text, "And this.")
  })
})

describe("ReadAloudController — multi-paragraph queue", () => {
  it("advances automatically from one paragraph's onend into the next utterance", () => {
    const h = harness(["One.", "Two.", "Three."])
    h.controller.play()
    h.current()!.onstart!()
    assert.equal(h.indices[h.indices.length - 1], 0)

    h.current()!.onend!()
    assert.equal(h.current()!.text, "Two.")
    assert.equal(h.controller.getIndex(), 1)

    h.current()!.onstart!()
    h.current()!.onend!()
    assert.equal(h.current()!.text, "Three.")
    assert.equal(h.controller.getIndex(), 2)
  })

  it("reaching the end of the last paragraph returns to 'stopped' at index 0, not stuck mid-article", () => {
    const h = harness(["One.", "Two."])
    h.controller.play()
    h.current()!.onstart!()
    h.current()!.onend!() // → "Two."
    h.current()!.onstart!()
    h.current()!.onend!() // end of article
    assert.equal(h.controller.getState(), "stopped")
    assert.equal(h.controller.getIndex(), 0)
  })
})

describe("ReadAloudController — pause / resume", () => {
  it("pause() calls speechSynthesis.pause() and moves to 'paused'; only valid while playing", () => {
    const h = harness(["One.", "Two."])
    h.controller.pause() // not playing yet — no-op
    assert.equal(h.synth.pauseCalls, 0)

    h.controller.play()
    h.current()!.onstart!()
    h.controller.pause()
    assert.equal(h.synth.pauseCalls, 1)
    assert.equal(h.controller.getState(), "paused")
  })

  it("resume() calls speechSynthesis.resume() and returns to 'playing'; only valid while paused", () => {
    const h = harness(["One.", "Two."])
    h.controller.resume() // idle — no-op
    assert.equal(h.synth.resumeCalls, 0)

    h.controller.play()
    h.current()!.onstart!()
    h.controller.pause()
    h.controller.resume()
    assert.equal(h.synth.resumeCalls, 1)
    assert.equal(h.controller.getState(), "playing")
  })

  it("play() while paused defers to resume() instead of restarting from paragraph one", () => {
    const h = harness(["One.", "Two.", "Three."])
    h.controller.play()
    h.current()!.onstart!()
    h.current()!.onend!() // now on "Two."
    h.current()!.onstart!()
    h.controller.pause()

    const speakCallsBefore = h.synth.speakCalls.length
    h.controller.play()
    assert.equal(h.synth.resumeCalls, 1)
    assert.equal(h.synth.speakCalls.length, speakCallsBefore, "play() while paused must not re-speak")
    assert.equal(h.controller.getIndex(), 1, "still on the same paragraph, not restarted")
  })
})

describe("ReadAloudController — stop", () => {
  it("stop() cancels synthesis, clears the queue position, and lands on 'stopped'", () => {
    const h = harness(["One.", "Two.", "Three."])
    h.controller.play()
    h.current()!.onstart!()
    h.current()!.onend!() // now on "Two."
    h.current()!.onstart!()

    h.controller.stop()
    assert.equal(h.synth.cancelCalls, 1)
    assert.equal(h.controller.getState(), "stopped")
    assert.equal(h.controller.getIndex(), 0)
  })

  it("play() after stop() starts over from the first paragraph, not the stopped position", () => {
    const h = harness(["One.", "Two.", "Three."])
    h.controller.play()
    h.current()!.onstart!()
    h.current()!.onend!() // now on "Two."
    h.controller.stop()

    h.controller.play()
    assert.equal(h.current()!.text, "One.")
  })

  it("stop() is a no-op while idle/stopped/unavailable/unsupported — nothing to cancel", () => {
    const h = harness(["One."])
    h.controller.stop()
    assert.equal(h.synth.cancelCalls, 0)
    assert.equal(h.controller.getState(), "idle")
  })

  it("PLAY → STOP → PLAY never produces two overlapping readings (only one speak() call is ever pending at a time)", () => {
    const h = harness(["One.", "Two."])
    h.controller.play()
    h.current()!.onstart!()
    h.controller.stop()
    h.controller.play()
    h.current()!.onstart!()

    // Exactly two speak() calls total (the original + the restart) —
    // never a third from some leftover in-flight utterance.
    assert.equal(h.synth.speakCalls.length, 2)
    assert.equal(h.controller.getState(), "playing")
  })
})

describe("ReadAloudController — next / previous", () => {
  it("next() cancels the current utterance and starts the next paragraph immediately", () => {
    const h = harness(["One.", "Two.", "Three."])
    h.controller.play()
    h.current()!.onstart!()

    h.controller.next()
    assert.equal(h.synth.cancelCalls, 1)
    assert.equal(h.current()!.text, "Two.")
    assert.equal(h.controller.getIndex(), 1)
  })

  it("next() at the last paragraph is a no-op — no seek past the end", () => {
    const h = harness(["One.", "Two."])
    h.controller.play()
    h.current()!.onstart!()
    h.controller.next() // → "Two."
    h.current()!.onstart!()

    const speakCallsBefore = h.synth.speakCalls.length
    h.controller.next()
    assert.equal(h.synth.speakCalls.length, speakCallsBefore)
    assert.equal(h.controller.getIndex(), 1)
  })

  it("previous() cancels the current utterance and restarts the prior paragraph from its beginning", () => {
    const h = harness(["One.", "Two.", "Three."])
    h.controller.play()
    h.current()!.onstart!()
    h.current()!.onend!() // → "Two."
    h.current()!.onstart!()

    h.controller.previous()
    assert.equal(h.current()!.text, "One.")
    assert.equal(h.controller.getIndex(), 0)
  })

  it("previous() at the first paragraph is a no-op", () => {
    const h = harness(["One.", "Two."])
    h.controller.play()
    h.current()!.onstart!()

    const speakCallsBefore = h.synth.speakCalls.length
    h.controller.previous()
    assert.equal(h.synth.speakCalls.length, speakCallsBefore)
    assert.equal(h.controller.getIndex(), 0)
  })

  it("next()/previous() are no-ops from idle — only meaningful during playing/paused", () => {
    const h = harness(["One.", "Two."])
    h.controller.next()
    h.controller.previous()
    assert.equal(h.synth.speakCalls.length, 0)
    assert.equal(h.controller.getState(), "idle")
  })
})

describe("ReadAloudController — stale utterance events / race conditions", () => {
  it("a late onend from an utterance cancelled by next() must not double-advance the queue", () => {
    const h = harness(["One.", "Two.", "Three."])
    h.controller.play()
    h.current()!.onstart!()
    const stale = h.current()!

    h.controller.next() // now genuinely on "Two."
    assert.equal(h.controller.getIndex(), 1)

    // The real browser can still fire the OLD utterance's onend after
    // cancel() — simulate that arriving late.
    stale.onend?.()
    assert.equal(h.controller.getIndex(), 1, "a stale onend must not advance past the real current paragraph")
    assert.equal(h.current()!.text, "Two.")
  })

  it("a late onerror from an utterance cancelled by stop() must not flip a fresh reading into 'error'", () => {
    const h = harness(["One.", "Two."])
    h.controller.play()
    h.current()!.onstart!()
    const stale = h.current()!

    h.controller.stop()
    h.controller.play() // fresh reading begins
    h.current()!.onstart!()
    assert.equal(h.controller.getState(), "playing")

    stale.onerror?.({ error: "canceled" })
    assert.equal(h.controller.getState(), "playing", "a stale error from the old utterance must not clobber the new one")
  })

  it("'interrupted'/'canceled' onerror codes — the expected result of our own cancel() — never surface as 'error'", () => {
    for (const code of ["interrupted", "canceled"]) {
      const h = harness(["One."])
      h.controller.play()
      h.current()!.onstart!()
      h.current()!.onerror!({ error: code })
      assert.equal(h.controller.getState(), "playing", code)
    }
  })

  it("a genuine engine error code moves to 'error'", () => {
    const h = harness(["One."])
    h.controller.play()
    h.current()!.onstart!()
    h.current()!.onerror!({ error: "synthesis-failed" })
    assert.equal(h.controller.getState(), "error")
  })
})

describe("ReadAloudController — cleanup on unmount / item change", () => {
  it("stop() (the hook's unmount/id-change cleanup call) tears down an in-progress reading with no lingering utterance able to resurrect it", () => {
    const h = harness(["One.", "Two."])
    h.controller.play()
    h.current()!.onstart!()
    const stale = h.current()!

    h.controller.stop() // what the hook's cleanup calls
    assert.equal(h.synth.cancelCalls, 1)

    stale.onend?.()
    assert.equal(h.controller.getState(), "stopped", "no event from the torn-down utterance can restart anything")
    assert.equal(h.synth.speakCalls.length, 1, "no new speak() call was triggered")
  })
})

describe("buildSpeechQueue — paragraph segmentation", () => {
  it("one utterance unit per paragraph for ordinary content", () => {
    assert.deepEqual(buildSpeechQueue(["First.", "Second.", "Third."]), ["First.", "Second.", "Third."])
  })

  it("an oversized paragraph is split on whitespace, never mid-word", () => {
    const word = "supercalifragilisticexpialidocious"
    const longParagraph = Array.from({ length: 40 }, () => word).join(" ")
    const queue = buildSpeechQueue([longParagraph], 100)
    assert.ok(queue.length > 1, "the oversized paragraph was split into more than one unit")
    for (const unit of queue) {
      assert.ok(unit.length <= 100, `unit exceeds the safety cap: ${unit.length}`)
    }
    // Every unit is a clean concatenation of whole words — reassembling
    // them reproduces the original text exactly, so nothing was cut.
    assert.equal(queue.join(" "), longParagraph)
  })

  it("an ordinary short paragraph is left untouched, one unit, unchanged", () => {
    assert.deepEqual(buildSpeechQueue(["A short paragraph."], 1000), ["A short paragraph."])
  })
})

describe("getSpeechEngine — real browser-capability detection", () => {
  it("returns undefined outside a browser (this test process has no window) — never throws, never guesses support", () => {
    assert.equal(typeof window, "undefined", "sanity check: this really is a non-browser environment")
    assert.equal(getSpeechEngine(), undefined)
  })
})

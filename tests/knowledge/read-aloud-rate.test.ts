/* ================================================================== *
 * READ ALOUD — playback speed and the remembered preference.
 *
 * THE ONE THING THE WEB SPEECH API WILL NOT DO: retune an utterance
 * that is already being spoken. `rate` is fixed when the utterance is
 * created. A control that only recorded the new value would therefore
 * do nothing audible until the next paragraph — a dead control that
 * looks alive. ReadAloudController.setRate cancels and re-speaks the
 * current unit instead, which restarts that paragraph and is the
 * honest trade.
 *
 * THE PREFERENCE is validated on the way in, not just on the way out:
 * localStorage is writable by anything running on this origin, and
 * SpeechSynthesisUtterance.rate accepts 0.1 to 10 — a stored "9"
 * would produce speech nobody can follow, from a value no UI of ours
 * ever offered.
 *
 * MUTATION-CHECKED, per AGENTS.md §8:
 *   - drop the `this.state === "playing"` branch from setRate → "a
 *     change while playing re-speaks the current paragraph" fails.
 *   - make loadReadAloudRate return the parsed number without
 *     isReadAloudRate → "refuses a stored speed outside the offered
 *     set" fails.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DEFAULT_READ_ALOUD_RATE,
  isReadAloudRate,
  loadReadAloudRate,
  persistReadAloudRate,
  READ_ALOUD_RATE_KEY,
  READ_ALOUD_RATES,
  ReadAloudController,
  type SpeechEngine,
  type SpeechSynthesisLike,
  type SpeechSynthesisUtteranceLike,
} from "@/lib/knowledge/read-aloud"

class FakeUtterance implements SpeechSynthesisUtteranceLike {
  text: string
  lang = ""
  rate = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

class FakeSynth implements SpeechSynthesisLike {
  spoken: FakeUtterance[] = []
  cancels = 0
  resumes = 0
  speak(u: SpeechSynthesisUtteranceLike) {
    this.spoken.push(u as FakeUtterance)
  }
  cancel() {
    this.cancels++
  }
  pause() {}
  resume() {
    this.resumes++
  }
}

function harness(paragraphs = ["Um parágrafo.", "Outro parágrafo."]) {
  const synth = new FakeSynth()
  const engine: SpeechEngine = { synth, makeUtterance: (t) => new FakeUtterance(t) }
  const controller = new ReadAloudController(paragraphs, "pt-BR", engine, () => {}, () => {})
  return { controller, synth, last: () => synth.spoken[synth.spoken.length - 1] }
}

/** The real engine fires onstart; without it the controller is idle
 *  and setRate's playing branch is never reached. */
function start(h: ReturnType<typeof harness>) {
  h.controller.play()
  h.last()?.onstart?.()
}

/** A localStorage stand-in. The real one is not present in Node, and
 *  the point here is the validation, not the browser. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: (k: string) => map.get(k) ?? null,
  }
}

/* ---- the offered set ---------------------------------------------- */

describe("the offered speeds", () => {
  it("is exactly the five the product promises", () => {
    assert.deepEqual([...READ_ALOUD_RATES], [0.75, 1, 1.25, 1.5, 2])
  })

  it("defaults to normal speed", () => {
    assert.equal(DEFAULT_READ_ALOUD_RATE, 1)
  })

  it("isReadAloudRate accepts only those five", () => {
    for (const r of READ_ALOUD_RATES) assert.equal(isReadAloudRate(r), true, `${r} is offered`)
    for (const bad of [0, 0.5, 1.1, 3, 10, -1, NaN, Infinity]) {
      assert.equal(isReadAloudRate(bad), false, `${bad} is not offered`)
    }
  })

  it("rejects non-numbers, including a numeric string", () => {
    for (const bad of ["1", "1.5", null, undefined, {}, [], true]) {
      assert.equal(isReadAloudRate(bad), false)
    }
  })
})

/* ---- applying it --------------------------------------------------- */

describe("the rate reaches the utterance", () => {
  it("speaks at the default rate before anything is chosen", () => {
    const h = harness()
    h.controller.play()
    assert.equal(h.last().rate, DEFAULT_READ_ALOUD_RATE)
  })

  it("applies a chosen rate to the next paragraph", () => {
    const h = harness()
    h.controller.setRate(1.5)
    h.controller.play()
    assert.equal(h.last().rate, 1.5)
  })

  it("keeps the rate across next() and through the queue", () => {
    const h = harness(["Um.", "Dois.", "Três."])
    h.controller.setRate(2)
    start(h)
    h.controller.next()
    assert.equal(h.last().rate, 2)
    h.last().onend?.()
    assert.equal(h.last().rate, 2, "a later paragraph must not fall back to 1x")
  })

  it("getRate reports what was set", () => {
    const h = harness()
    assert.equal(h.controller.getRate(), DEFAULT_READ_ALOUD_RATE)
    h.controller.setRate(0.75)
    assert.equal(h.controller.getRate(), 0.75)
  })
})

describe("changing speed mid-paragraph", () => {
  it("re-speaks the current paragraph at the new rate", () => {
    // THE BEHAVIOUR THIS PINS. Without the re-speak the control is
    // inert until the paragraph happens to end.
    const h = harness(["Primeiro.", "Segundo."])
    start(h)
    const spokenBefore = h.synth.spoken.length
    const textBefore = h.last().text

    h.controller.setRate(1.25)

    assert.equal(h.synth.spoken.length, spokenBefore + 1, "it must speak again, not wait")
    assert.equal(h.last().text, textBefore, "and it must be the SAME paragraph, not the next one")
    assert.equal(h.last().rate, 1.25)
    assert.ok(h.synth.cancels > 0, "the outgoing utterance must be cancelled first")
  })

  it("does not restart when the chosen rate is the current one", () => {
    const h = harness()
    start(h)
    const before = h.synth.spoken.length
    h.controller.setRate(DEFAULT_READ_ALOUD_RATE)
    assert.equal(h.synth.spoken.length, before, "re-speaking for a no-op change would stutter the article")
  })

  it("only records the value while idle — it does not start speaking", () => {
    const h = harness()
    h.controller.setRate(2)
    assert.equal(h.synth.spoken.length, 0, "choosing a speed is not a play command")
    assert.equal(h.controller.getRate(), 2)
  })

  it("the stale utterance's late onend cannot advance the queue", () => {
    // The cancelled utterance still fires; the generation guard is what
    // stops it skipping a paragraph.
    const h = harness(["Primeiro.", "Segundo."])
    start(h)
    const stale = h.last()
    h.controller.setRate(1.5)
    const afterRespeak = h.synth.spoken.length
    stale.onend?.()
    assert.equal(h.synth.spoken.length, afterRespeak, "a superseded utterance must be inert")
    assert.equal(h.last().text, "Primeiro.", "still on the first paragraph")
  })
})

/* ---- P2-1: changing speed while PAUSED ------------------------------ *
 *
 * THE DEFECT. setRate() only re-spoke while "playing". Paused, it
 * recorded the value and returned, and resume() called
 * synth.resume() — which continues the SAME utterance, built at the
 * old rate. The reader paused, picked 2x, resumed, and heard the rest
 * of the paragraph at 1x while the control read 2x.
 *
 * THE FIX IS NOT "also re-speak while paused": speak() starts audio
 * immediately, so that would silently un-pause. The restart is
 * DEFERRED to resume(), which is the moment the reader actually asks
 * for audio.
 *
 * MUTATION-CHECKED, per AGENTS.md §8:
 *   - drop the paused branch from setRate() → "applies the new rate
 *     to the current paragraph after resume" fails.
 *   - make that branch call speakCurrent() directly → "does not start
 *     speaking while paused" fails.
 *   - drop synth.resume() from the restart sequence → "clears the
 *     engine's paused flag before speaking again" fails.
 * ------------------------------------------------------------------ */

describe("changing speed while paused", () => {
  it("does not start speaking while paused", () => {
    // THE REGRESSION THIS GUARDS. Changing a setting must never be a
    // play command.
    const h = harness()
    start(h)
    h.controller.pause()
    const spokenBefore = h.synth.spoken.length

    h.controller.setRate(2)

    assert.equal(h.synth.spoken.length, spokenBefore, "no new utterance may be spoken while paused")
    assert.equal(h.controller.getState(), "paused", "and the controller must still read as paused")
  })

  it("records the chosen rate immediately, so the control is honest", () => {
    const h = harness()
    start(h)
    h.controller.pause()
    h.controller.setRate(2)
    assert.equal(h.controller.getRate(), 2)
  })

  it("applies the new rate to the current paragraph after resume", () => {
    // THE DEFECT ITSELF.
    const h = harness(["Primeiro.", "Segundo."])
    start(h)
    const textBefore = h.last().text
    h.controller.pause()
    h.controller.setRate(2)

    h.controller.resume()

    assert.equal(h.last().rate, 2, "the paragraph the reader is on must honour the new speed")
    assert.equal(h.last().text, textBefore, "and it must be the SAME paragraph, restarted")
  })

  it("clears the engine's paused flag before speaking again", () => {
    // Requirement 7: cancel() does not reliably clear the engine's
    // global paused flag, and an utterance spoken while it is set may
    // never start — Read Aloud would appear to die silently.
    const h = harness()
    start(h)
    h.controller.pause()
    h.controller.setRate(1.5)

    const resumesBefore = h.synth.resumes
    h.controller.resume()

    assert.ok(h.synth.resumes > resumesBefore, "synth.resume() must be called as part of the restart")
    assert.ok(h.synth.cancels > 0, "and the stale utterance cancelled first")
  })

  it("ends up playing, not paused, after resume", () => {
    const h = harness()
    start(h)
    h.controller.pause()
    h.controller.setRate(2)
    h.controller.resume()
    h.last().onstart?.()
    assert.equal(h.controller.getState(), "playing")
  })

  it("keeps the queue and the paragraph index intact", () => {
    const h = harness(["Primeiro.", "Segundo.", "Terceiro."])
    start(h)
    h.last().onend?.() // now on the second paragraph
    assert.equal(h.last().text, "Segundo.")
    h.last().onstart?.()

    h.controller.pause()
    h.controller.setRate(1.25)
    h.controller.resume()

    assert.equal(h.controller.getIndex(), 1, "no skip and no rewind")
    assert.equal(h.controller.getParagraphIndex(), 1)
    assert.equal(h.last().text, "Segundo.", "the restart is of the paragraph the reader was on")
  })

  it("a late onend from the replaced utterance does not advance the queue", () => {
    const h = harness(["Primeiro.", "Segundo."])
    start(h)
    const stale = h.last()
    h.controller.pause()
    h.controller.setRate(2)
    h.controller.resume()
    const after = h.synth.spoken.length

    stale.onend?.()

    assert.equal(h.synth.spoken.length, after, "a superseded utterance must stay inert")
    assert.equal(h.last().text, "Primeiro.", "still on the first paragraph")
    assert.equal(h.controller.getIndex(), 0)
  })

  it("a late onerror from the replaced utterance does not flip the state", () => {
    const h = harness()
    start(h)
    const stale = h.last()
    h.controller.pause()
    h.controller.setRate(2)
    h.controller.resume()
    h.last().onstart?.()

    stale.onerror?.({ error: "interrupted" })
    assert.equal(h.controller.getState(), "playing")

    stale.onerror?.({ error: "synthesis-failed" })
    assert.equal(h.controller.getState(), "playing", "a stale error must not report a failure of the live utterance")
  })

  it("re-selecting the SAME rate while paused changes nothing", () => {
    const h = harness()
    start(h)
    h.controller.pause()
    const spokenBefore = h.synth.spoken.length
    const cancelsBefore = h.synth.cancels

    h.controller.setRate(DEFAULT_READ_ALOUD_RATE)
    h.controller.resume()

    assert.equal(h.synth.spoken.length, spokenBefore, "a no-op change must not restart the paragraph")
    assert.equal(h.synth.cancels, cancelsBefore, "nor cancel anything")
  })

  it("the new rate still applies to the following paragraphs", () => {
    const h = harness(["Primeiro.", "Segundo."])
    start(h)
    h.controller.pause()
    h.controller.setRate(1.5)
    h.controller.resume()
    h.last().onstart?.()
    h.last().onend?.()
    assert.equal(h.last().text, "Segundo.")
    assert.equal(h.last().rate, 1.5)
  })

  it("a rate change while STOPPED still does not speak", () => {
    const h = harness()
    start(h)
    h.controller.stop()
    const spokenBefore = h.synth.spoken.length
    h.controller.setRate(2)
    assert.equal(h.synth.spoken.length, spokenBefore)
    assert.equal(h.controller.getState(), "stopped")
  })

  it("stopping discards a pending restart", () => {
    // Nothing is owed to a paragraph that will not be spoken.
    const h = harness()
    start(h)
    h.controller.pause()
    h.controller.setRate(2)
    h.controller.stop()
    const cancelsBefore = h.synth.cancels

    h.controller.play()

    assert.equal(h.last().rate, 2, "the chosen rate survives")
    assert.equal(h.last().text, "Um parágrafo.", "and play starts from the top, as it always did")
    assert.ok(h.synth.cancels === cancelsBefore, "no extra cancel from a stale pending restart")
  })
})

/* ---- remembering it ------------------------------------------------ */

describe("the remembered preference", () => {
  it("round-trips through storage", () => {
    const store = fakeStorage()
    persistReadAloudRate(1.5, store)
    assert.equal(store.read(READ_ALOUD_RATE_KEY), "1.5")
    assert.equal(loadReadAloudRate(store), 1.5)
  })

  it("falls back to the default when nothing is stored", () => {
    assert.equal(loadReadAloudRate(fakeStorage()), DEFAULT_READ_ALOUD_RATE)
  })

  it("refuses a stored speed outside the offered set", () => {
    // localStorage is writable by anything on this origin, and rate
    // accepts up to 10x — unusable noise from a value no UI offered.
    for (const bad of ["9", "0.1", "-1", "0"]) {
      assert.equal(
        loadReadAloudRate(fakeStorage({ [READ_ALOUD_RATE_KEY]: bad })),
        DEFAULT_READ_ALOUD_RATE,
        `${bad} must not survive the read`,
      )
    }
  })

  it("refuses a stored value that is not a number at all", () => {
    for (const bad of ["fast", "", "{}", "null"]) {
      assert.equal(loadReadAloudRate(fakeStorage({ [READ_ALOUD_RATE_KEY]: bad })), DEFAULT_READ_ALOUD_RATE)
    }
  })

  it("survives storage that throws — private mode, blocked site data", () => {
    const throwing = {
      getItem: () => {
        throw new Error("The operation is insecure.")
      },
      setItem: () => {
        throw new Error("The operation is insecure.")
      },
    }
    assert.equal(loadReadAloudRate(throwing), DEFAULT_READ_ALOUD_RATE)
    assert.doesNotThrow(() => persistReadAloudRate(2, throwing), "a preference is not worth breaking playback over")
  })

  it("uses a versioned key, so a future change to the speeds starts clean", () => {
    assert.match(READ_ALOUD_RATE_KEY, /\.v\d+$/)
  })
})

/* ---- wiring -------------------------------------------------------- */

describe("the Reader is wired to it", () => {
  const hook = readFileSync(join(process.cwd(), "lib/knowledge/use-read-aloud.ts"), "utf8")
  const reader = readFileSync(join(process.cwd(), "components/knowledge/reader-view.tsx"), "utf8")

  it("the hook exposes rate and setRate", () => {
    assert.match(hook, /rate: ReadAloudRate/)
    assert.match(hook, /setRate: \(rate: ReadAloudRate\) => void/)
  })

  it("the hook persists the choice when it changes", () => {
    assert.match(hook, /persistReadAloudRate\(next\)/, "choosing a speed must outlive the page")
  })

  it("the hook loads the stored choice lazily, not on every render", () => {
    assert.match(hook, /useState<ReadAloudRate>\(\(\) => loadReadAloudRate\(\)\)/)
  })

  it("the Reader renders the five speeds from the single source", () => {
    assert.match(reader, /READ_ALOUD_RATES\.map/, "a hardcoded list here would drift from the controller's")
  })

  it("the Reader marks the narrated paragraph only while speaking", () => {
    // A resting player must not mark paragraph 0 as if it were live.
    assert.match(
      reader,
      /read\.state === "playing" \|\| read\.state === "paused"\s*\?\s*read\.paragraphIndex\s*:\s*null/,
    )
    assert.match(reader, /aria-current=\{i === spokenIndex/, "the mark must reach a screen reader too")
  })
})

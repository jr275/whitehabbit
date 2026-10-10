/* ================================================================== *
 * READ ALOUD × VOICES — the runtime integration.
 *
 * The previous two files test the policy and the discovery in
 * isolation. This one tests what happens when they meet the
 * controller, and it is where the invariants of Stage 3 actually
 * live:
 *
 *   - utterance.lang comes from the ARTICLE, always, whether or not a
 *     voice was found. A voice is a preference; the language is a
 *     fact about the text, and an engine that ignores our voice still
 *     needs to be told what it is reading.
 *   - the voice is read PER UTTERANCE, never cached on the
 *     controller. That is what makes "a voice update must not restart
 *     playback" structural rather than a rule someone has to
 *     remember: there is no voice state to invalidate.
 *   - a list that fills in late is used by the NEXT paragraph, with
 *     no restart, no skip, no rewind, and no change to the rate.
 *
 * MUTATION-CHECKED, per AGENTS.md §8:
 *   - set utterance.lang from the matched voice instead of the
 *     article → "keeps the article's language when only a regional
 *     cousin was found" fails.
 *   - cache the voice list on the controller at construction → "picks
 *     up voices that arrived after playback started" fails.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_READ_ALOUD_RATE,
  ReadAloudController,
  type SpeechEngine,
  type SpeechSynthesisLike,
  type SpeechSynthesisUtteranceLike,
} from "@/lib/knowledge/read-aloud"
import type { SpeechSynthesisVoiceLike } from "@/lib/knowledge/voice-selection"

const v = (
  lang: string,
  name: string,
  extra: Partial<SpeechSynthesisVoiceLike> = {},
): SpeechSynthesisVoiceLike => ({ lang, name, ...extra })

class FakeUtterance implements SpeechSynthesisUtteranceLike {
  text: string
  lang = ""
  rate = 1
  voice: SpeechSynthesisVoiceLike | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

/** A synth whose voice list the test can change mid-playback, which
 *  is the whole point of this file. */
class FakeSynth implements SpeechSynthesisLike {
  spoken: FakeUtterance[] = []
  cancels = 0
  voices: SpeechSynthesisVoiceLike[]
  constructor(voices: SpeechSynthesisVoiceLike[] = []) {
    this.voices = voices
  }
  getVoices() {
    return this.voices
  }
  speak(u: SpeechSynthesisUtteranceLike) {
    this.spoken.push(u as FakeUtterance)
  }
  cancel() {
    this.cancels++
  }
  pause() {}
  resume() {}
}

function harness(opts: { paragraphs?: string[]; lang?: string; voices?: SpeechSynthesisVoiceLike[] } = {}) {
  const paragraphs = opts.paragraphs ?? ["Primeiro.", "Segundo.", "Terceiro."]
  const synth = new FakeSynth(opts.voices ?? [])
  const engine: SpeechEngine = { synth, makeUtterance: (t) => new FakeUtterance(t) }
  const indices: number[] = []
  const controller = new ReadAloudController(
    paragraphs,
    opts.lang ?? "pt-BR",
    engine,
    () => {},
    (i) => indices.push(i),
  )
  return {
    controller,
    synth,
    indices,
    last: () => synth.spoken[synth.spoken.length - 1],
    /** The real engine fires onstart; without it the controller is
     *  idle and next()/setRate's playing branch never runs. */
    start() {
      controller.play()
      this.last()?.onstart?.()
    },
    finish() {
      this.last()?.onend?.()
    },
  }
}

/* ---- choosing the voice --------------------------------------------- */

describe("the controller names a voice when one matches", () => {
  it("uses the exact-locale voice", () => {
    const h = harness({ voices: [v("en-US", "English"), v("pt-BR", "Brazilian")] })
    h.controller.play()
    assert.equal(h.last().voice?.name, "Brazilian")
    assert.equal(h.last().lang, "pt-BR")
  })

  it("keeps the article's language when only a regional cousin was found", () => {
    // THE INVARIANT. Setting lang from the voice would relabel a
    // Brazilian article as European Portuguese.
    const h = harness({ voices: [v("pt-PT", "European")] })
    h.controller.play()
    assert.equal(h.last().voice?.name, "European", "pt-PT is the best available")
    assert.equal(h.last().lang, "pt-BR", "but the article is still pt-BR")
  })

  it("leaves the voice unset when nothing matches, keeping the language", () => {
    const h = harness({ voices: [v("ja-JP", "Japanese"), v("en-US", "English")] })
    h.controller.play()
    assert.equal(h.last().voice, null, "a wrong-language voice is worse than the engine's own default")
    assert.equal(h.last().lang, "pt-BR")
  })

  it("leaves the voice unset when the list is empty", () => {
    // Safari before the list arrives.
    const h = harness({ voices: [] })
    h.controller.play()
    assert.equal(h.last().voice, null)
    assert.equal(h.last().lang, "pt-BR", "the engine still gets told what language to read")
  })

  it("works with an engine that cannot list voices at all", () => {
    // getVoices is optional on SpeechSynthesisLike; the 29 pre-existing
    // tests use exactly such a fake, and must keep working.
    // The array is held outside the literal so `this` typing inside
    // the method body is not part of what is being asserted.
    const spoken: FakeUtterance[] = []
    const synth: SpeechSynthesisLike = {
      speak(u: SpeechSynthesisUtteranceLike) {
        spoken.push(u as FakeUtterance)
      },
      cancel() {},
      pause() {},
      resume() {},
    }
    const engine: SpeechEngine = { synth, makeUtterance: (t) => new FakeUtterance(t) }
    const c = new ReadAloudController(["Um."], "pt-BR", engine, () => {}, () => {})
    assert.doesNotThrow(() => c.play())
    assert.equal(spoken[0].lang, "pt-BR")
    assert.equal(spoken[0].voice, null)
  })

  it("applies the voice to every paragraph, not just the first", () => {
    const h = harness({ voices: [v("pt-BR", "Brazilian")] })
    h.start()
    h.finish()
    assert.equal(h.last().text, "Segundo.")
    assert.equal(h.last().voice?.name, "Brazilian", "the second utterance must be configured too")
  })
})

/* ---- a list that changes mid-playback -------------------------------- */

describe("voices arriving late must not disturb playback", () => {
  it("picks up voices that arrived after playback started", () => {
    // THE SAFARI SCENARIO. Nothing at play(); the real list lands
    // while the first paragraph is being read.
    const h = harness({ voices: [] })
    h.start()
    assert.equal(h.last().voice, null, "nothing was available yet")

    h.synth.voices = [v("pt-BR", "Brazilian")]

    h.finish()
    assert.equal(h.last().text, "Segundo.")
    assert.equal(h.last().voice?.name, "Brazilian", "the next paragraph uses what is now available")
  })

  it("a voice list change does not re-speak the current paragraph", () => {
    const h = harness({ voices: [] })
    h.start()
    const spokenBefore = h.synth.spoken.length

    h.synth.voices = [v("pt-BR", "Brazilian")]

    assert.equal(h.synth.spoken.length, spokenBefore, "updating voices is not a play command")
    assert.equal(h.synth.cancels, 0, "and must not cancel anything")
  })

  it("a voice list change does not move the queue", () => {
    const h = harness({ voices: [] })
    h.start()
    const indexBefore = h.controller.getIndex()
    const paragraphBefore = h.controller.getParagraphIndex()

    h.synth.voices = [v("pt-BR", "A"), v("pt-PT", "B")]

    assert.equal(h.controller.getIndex(), indexBefore, "no skip")
    assert.equal(h.controller.getParagraphIndex(), paragraphBefore, "no rewind")
  })

  it("a voice list change does not touch the rate", () => {
    const h = harness({ voices: [] })
    h.controller.setRate(1.5)
    h.start()
    h.synth.voices = [v("pt-BR", "Brazilian")]
    assert.equal(h.controller.getRate(), 1.5)
    h.finish()
    assert.equal(h.last().rate, 1.5, "the reader's speed survives a voice update")
  })

  it("a voice that disappears mid-article degrades to no voice, not to a wrong one", () => {
    const h = harness({ voices: [v("pt-BR", "Brazilian")] })
    h.start()
    assert.equal(h.last().voice?.name, "Brazilian")

    h.synth.voices = [v("en-US", "English")]

    h.finish()
    assert.equal(h.last().voice, null, "an English voice must not inherit a Portuguese article")
    assert.equal(h.last().lang, "pt-BR")
  })
})

/* ---- voices alongside the Stage 2 behaviours -------------------------- */

describe("voices coexist with rate and the paragraph index", () => {
  it("a rate change re-speaks the same paragraph, with the same voice", () => {
    const h = harness({ voices: [v("pt-BR", "Brazilian")] })
    h.start()
    const textBefore = h.last().text

    h.controller.setRate(1.25)

    assert.equal(h.last().text, textBefore, "same paragraph")
    assert.equal(h.last().rate, 1.25, "new rate")
    assert.equal(h.last().voice?.name, "Brazilian", "voice re-resolved, not lost")
  })

  it("the default rate still applies when a voice is chosen", () => {
    const h = harness({ voices: [v("pt-BR", "Brazilian")] })
    h.controller.play()
    assert.equal(h.last().rate, DEFAULT_READ_ALOUD_RATE)
  })

  it("the paragraph index still tracks the queue through a split paragraph", () => {
    const long = "palavra ".repeat(200).trim()
    const h = harness({ paragraphs: [long, "segundo"], voices: [v("pt-BR", "Brazilian")] })
    h.start()
    assert.equal(h.controller.getParagraphIndex(), 0)
    // Drain every unit of the long paragraph.
    while (h.last().text !== "segundo") h.finish()
    assert.equal(h.controller.getParagraphIndex(), 1)
    assert.equal(h.last().voice?.name, "Brazilian")
  })

  it("a stale utterance's late onend still cannot advance the queue", () => {
    const h = harness({ voices: [v("pt-BR", "Brazilian")] })
    h.start()
    const stale = h.last()
    h.controller.setRate(1.5)
    const after = h.synth.spoken.length
    stale.onend?.()
    assert.equal(h.synth.spoken.length, after, "a superseded utterance must stay inert")
    assert.equal(h.last().text, "Primeiro.")
  })

  it("an English article gets an English voice from the same list", () => {
    const h = harness({
      lang: "en-US",
      voices: [v("pt-BR", "Brazilian"), v("en-US", "English", { localService: true })],
    })
    h.controller.play()
    assert.equal(h.last().voice?.name, "English")
    assert.equal(h.last().lang, "en-US")
  })

  it("an article with no declared language falls back without a wrong voice", () => {
    const h = harness({ lang: "", voices: [v("pt-BR", "Brazilian"), v("en-US", "English")] })
    h.controller.play()
    assert.equal(h.last().voice, null, "an unparseable locale must not match anything")
    assert.equal(h.last().lang, "", "and the controller passes through what it was given")
  })
})

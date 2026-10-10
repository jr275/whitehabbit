/* ================================================================== *
 * READ ALOUD — the article's own language, and which paragraph is
 * being narrated.
 *
 * TWO BUGS, ONE SHAPE: a value that existed but never arrived.
 *
 * 1. LANGUAGE. extract.ts:239 reads <html lang>, repo.ts:288 stores it
 *    in the `lang` column, ReadAloudController has taken a `lang`
 *    argument since it was written, and useReadAloud has accepted an
 *    optional `lang` third parameter. The chain broke in exactly two
 *    places: adapter.ts's rowToDocument did not copy the column onto
 *    the document, and reader-view.tsx called useReadAloud with two
 *    arguments. So every article was narrated in the READER's browser
 *    locale — a Portuguese page opened in an en-US browser was read
 *    aloud by an English voice.
 *
 * 2. PARAGRAPH INDEX. The controller reports its QUEUE index, and the
 *    queue is not the paragraph list: buildSpeechQueue flatMaps, so a
 *    paragraph over maxChars becomes several utterances and every
 *    later unit is offset. Highlighting paragraph[queueIndex] would
 *    mark the wrong paragraph on any article with one long one —
 *    which is most of them.
 *
 * MUTATION-CHECKED, per AGENTS.md §8:
 *   - drop `lang` from rowToDocument → "the document's language
 *     reaches the utterance" fails.
 *   - make getParagraphIndex() return this.index → "a split paragraph
 *     does not shift the paragraph index" fails.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  buildParagraphIndexMap,
  buildSpeechQueue,
  getDefaultLang,
  ReadAloudController,
  type SpeechEngine,
  type SpeechSynthesisLike,
  type SpeechSynthesisUtteranceLike,
} from "@/lib/knowledge/read-aloud"
import { rowToDocument } from "@/lib/knowledge/adapter"

/* ---- harness (local, so the existing suite is untouched) ---------- */

class FakeUtterance implements SpeechSynthesisUtteranceLike {
  text: string
  lang = ""
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

class FakeSynth implements SpeechSynthesisLike {
  spoken: FakeUtterance[] = []
  speak(u: SpeechSynthesisUtteranceLike) {
    this.spoken.push(u as FakeUtterance)
  }
  cancel() {}
  pause() {}
  resume() {}
}

function harness(paragraphs: string[], lang: string) {
  const synth = new FakeSynth()
  const engine: SpeechEngine = { synth, makeUtterance: (t) => new FakeUtterance(t) }
  const controller = new ReadAloudController(paragraphs, lang, engine, () => {}, () => {})
  return { controller, synth, last: () => synth.spoken[synth.spoken.length - 1] }
}

/** Finishes the utterance currently being spoken, which is how the
 *  real engine advances the queue. */
function finishCurrent(h: ReturnType<typeof harness>) {
  h.last()?.onend?.()
}

/** The real engine fires onstart, which is what moves the controller
 *  into "playing". next()/previous() refuse to act before that, so a
 *  test that skips it is testing a controller that is still idle. */
function start(h: ReturnType<typeof harness>) {
  h.controller.play()
  h.last()?.onstart?.()
}

/** Long enough to exceed the controller's own default maxChars of
 *  1000 — the only way a paragraph really splits without passing a
 *  custom limit the controller does not use. */
const LONG_PARAGRAPH = "palavra ".repeat(200).trim()

/* ---- 1. language -------------------------------------------------- */

describe("Read Aloud speaks the article's own language", () => {
  it("puts the given language on every utterance", () => {
    const h = harness(["Primeiro parágrafo.", "Segundo parágrafo."], "pt-BR")
    h.controller.play()
    assert.equal(h.last().lang, "pt-BR")
    finishCurrent(h)
    assert.equal(h.last().lang, "pt-BR", "the second utterance must not drift back to a default")
  })

  it("keeps the language across next() and previous()", () => {
    const h = harness(["Um.", "Dois.", "Três."], "pt-PT")
    start(h)
    h.controller.next()
    assert.equal(h.last().lang, "pt-PT")
    h.controller.previous()
    assert.equal(h.last().lang, "pt-PT")
  })

  it("getDefaultLang is a real BCP-47-shaped fallback, not an empty string", () => {
    // Reached only for pages that declare no language at all. An empty
    // lang makes the browser pick arbitrarily, which is the behaviour
    // this whole file exists to remove.
    const fallback = getDefaultLang()
    assert.ok(fallback.length >= 2, "a fallback must still name a language")
    assert.match(fallback, /^[a-z]{2}/i)
  })
})

describe("the language actually reaches the Reader", () => {
  it("rowToDocument carries the stored lang column onto the document", () => {
    // THE BREAK. The column was read and written for as long as it
    // existed; this boundary silently dropped it.
    const row = {
      id: "kn_1",
      org_id: "org_1",
      created_by: "usr_1",
      url: "https://exemplo.com.br/artigo",
      canonical_url: null,
      normalized_url: null,
      domain: "exemplo.com.br",
      status: "ready",
      kind: "article",
      error: null,
      attempts: 0,
      title: "Um artigo",
      author: null,
      site_name: null,
      excerpt: null,
      image_url: null,
      favicon: null,
      published_at: null,
      word_count: 120,
      reading_min: 1,
      lang: "pt-BR",
      content_text: "Primeiro parágrafo.",
      summary: null,
      content_hash: null,
      favorite: false,
      archived: false,
      read_at: null,
      created_at: "1700000000000",
      updated_at: "1700000000000",
    } as unknown as Parameters<typeof rowToDocument>[0]

    assert.equal(rowToDocument(row).lang, "pt-BR")
  })

  it("a page that declared no language yields undefined, never a guess", () => {
    const row = {
      id: "kn_2",
      org_id: "org_1",
      created_by: "usr_1",
      url: "https://example.com/a",
      domain: "example.com",
      status: "ready",
      kind: "article",
      attempts: 0,
      title: "No lang",
      lang: null,
      content_text: "Body.",
      favorite: false,
      archived: false,
      read_at: null,
      created_at: "1700000000000",
      updated_at: "1700000000000",
    } as unknown as Parameters<typeof rowToDocument>[0]

    assert.equal(rowToDocument(row).lang, undefined, "inventing a language would be fabricating metadata")
  })

  it("the Reader passes the document's language to the hook", () => {
    // Source-level, like tests/platform/google-auth-config.test.ts:
    // there is no component-rendering harness in this repo, and a
    // two-argument call is exactly how this bug looked.
    const source = readFileSync(join(process.cwd(), "components/knowledge/reader-view.tsx"), "utf8")
    assert.match(
      source,
      /useReadAloud\(\s*doc\.id\s*,\s*body\s*,\s*doc\.lang\s*\)/,
      "reader-view must pass doc.lang as the third argument",
    )
  })
})

/* ---- 2. which paragraph is being narrated ------------------------- */

describe("buildParagraphIndexMap", () => {
  it("is 1:1 when nothing splits", () => {
    const paragraphs = ["Short one.", "Short two.", "Short three."]
    assert.deepEqual(buildParagraphIndexMap(paragraphs), [0, 1, 2])
  })

  it("maps every unit of a split paragraph back to that paragraph", () => {
    // 'a '*40 exceeds maxChars=20 and splits; the map must repeat the
    // paragraph index once per unit.
    const long = "palavra ".repeat(40).trim()
    const paragraphs = [long, "curto"]
    const map = buildParagraphIndexMap(paragraphs, 20)
    assert.ok(map.length > 2, "the long paragraph must really have split")
    assert.equal(map[0], 0)
    assert.equal(map[map.length - 1], 1, "the last unit belongs to the second paragraph")
    assert.deepEqual(new Set(map), new Set([0, 1]), "no unit may map outside the real paragraphs")
  })

  it("always has exactly one entry per queue unit", () => {
    // The invariant that stops the two from drifting apart.
    const cases: string[][] = [
      [],
      ["one"],
      ["x".repeat(50), "y"],
      ["palavra ".repeat(40).trim(), "curto", "media ".repeat(10).trim()],
    ]
    for (const paragraphs of cases) {
      assert.equal(
        buildParagraphIndexMap(paragraphs, 20).length,
        buildSpeechQueue(paragraphs, 20).length,
        `map and queue must agree for ${paragraphs.length} paragraph(s)`,
      )
    }
  })
})

describe("getParagraphIndex", () => {
  it("starts at the first paragraph", () => {
    const h = harness(["A.", "B."], "en-US")
    assert.equal(h.controller.getParagraphIndex(), 0)
  })

  it("follows the paragraphs, not the queue, through a split one", () => {
    // THE BUG THIS PINS. With a paragraph that splits into 3 units,
    // queue index 3 is the SECOND paragraph. Returning the queue index
    // would highlight paragraph 3 — which may not even exist.
    const paragraphs = [LONG_PARAGRAPH, "segundo", "terceiro"]
    const synth = new FakeSynth()
    const engine: SpeechEngine = { synth, makeUtterance: (t) => new FakeUtterance(t) }
    const controller = new ReadAloudController(paragraphs, "pt-BR", engine, () => {}, () => {})

    const unitsOfFirst = buildParagraphIndexMap(paragraphs).filter((p) => p === 0).length
    assert.ok(unitsOfFirst > 1, "the first paragraph must really split for this test to mean anything")

    controller.play()
    synth.spoken[synth.spoken.length - 1].onstart?.()
    assert.equal(controller.getParagraphIndex(), 0, "still inside the first paragraph")

    // Finish every unit of the first paragraph.
    for (let i = 0; i < unitsOfFirst; i += 1) {
      synth.spoken[synth.spoken.length - 1].onend?.()
    }
    assert.equal(controller.getParagraphIndex(), 1, "now on the second paragraph, not queue unit 1")
  })

  it("reports the paragraph the hook would highlight after next()", () => {
    const h = harness(["Um.", "Dois.", "Três."], "pt-BR")
    start(h)
    h.controller.next()
    assert.equal(h.controller.getParagraphIndex(), 1)
    h.controller.next()
    assert.equal(h.controller.getParagraphIndex(), 2)
  })

  it("the hook exposes it, so a UI can mark the paragraph", () => {
    const source = readFileSync(join(process.cwd(), "lib/knowledge/use-read-aloud.ts"), "utf8")
    assert.match(source, /paragraphIndex: number/, "UseReadAloudResult must expose it")
    assert.match(source, /getParagraphIndex\(\)/, "and must read it from the controller, not recompute it")
  })
})

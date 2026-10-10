/* ================================================================== *
 * VOICE SELECTION — the policy, tested against fabricated lists.
 *
 * WHY FABRICATED. The voices installed on the machine running this
 * suite are not the voices on a reader's iPhone. A test that asserts
 * "picks Luciana" passes on one laptop and means nothing anywhere
 * else. Every list here is a literal, so the POLICY is what is under
 * test — exact before regional, regional before nothing, and a
 * deterministic tiebreak — not the contents of anyone's system.
 *
 * THE ONE DISTINCTION THAT MATTERS MOST: pt-PT is not pt-BR. It is a
 * usable fallback and an audibly different accent, so it is returned
 * as kind "language", never "exact". Collapsing the two would make it
 * impossible for anything downstream to tell a real match from a
 * near one.
 *
 * MUTATION-CHECKED, per AGENTS.md §8:
 *   - make the exact pass case-sensitive → "matches regardless of
 *     case" fails.
 *   - drop the baseLanguageOf null guard → "a malformed locale yields
 *     no voice" fails.
 *   - return "exact" for the language tier → "pt-PT is a fallback,
 *     not an equivalent" fails.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { baseLanguageOf, selectVoice, type SpeechSynthesisVoiceLike } from "@/lib/knowledge/voice-selection"

const v = (
  lang: string,
  name: string,
  extra: Partial<SpeechSynthesisVoiceLike> = {},
): SpeechSynthesisVoiceLike => ({ lang, name, ...extra })

const TYPICAL: SpeechSynthesisVoiceLike[] = [
  v("en-US", "US English", { localService: true, default: true }),
  v("en-GB", "UK English"),
  v("pt-BR", "Brazilian Portuguese", { localService: true }),
  v("pt-PT", "European Portuguese"),
  v("es-ES", "Spanish"),
]

/* ---- baseLanguageOf ------------------------------------------------ */

describe("baseLanguageOf", () => {
  it("takes the primary subtag, lowercased", () => {
    assert.equal(baseLanguageOf("pt-BR"), "pt")
    assert.equal(baseLanguageOf("PT-br"), "pt")
    assert.equal(baseLanguageOf("en"), "en")
    assert.equal(baseLanguageOf("  fr-CA  "), "fr")
    assert.equal(baseLanguageOf("fil-PH"), "fil", "three-letter primary subtags are real")
  })

  it("rejects anything that is not a language tag", () => {
    // A malformed locale must not match everything by accident.
    for (const bad of ["", "   ", "x", "1234", "123-BR", "-BR", "pt_BR"]) {
      assert.equal(baseLanguageOf(bad), null, `${JSON.stringify(bad)} is not a tag`)
    }
  })

  it("rejects non-strings without throwing", () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      assert.equal(baseLanguageOf(bad), null)
    }
  })
})

/* ---- exact match --------------------------------------------------- */

describe("selectVoice — exact locale", () => {
  it("picks pt-BR for a pt-BR article", () => {
    const m = selectVoice("pt-BR", TYPICAL)
    assert.equal(m.kind, "exact")
    assert.equal(m.voice?.name, "Brazilian Portuguese")
  })

  it("picks en-US for an en-US article", () => {
    const m = selectVoice("en-US", TYPICAL)
    assert.equal(m.kind, "exact")
    assert.equal(m.voice?.name, "US English")
  })

  it("matches regardless of case, on either side", () => {
    // Engines report "pt-BR", "pt-br" and occasionally "PT-BR".
    assert.equal(selectVoice("pt-br", TYPICAL).voice?.name, "Brazilian Portuguese")
    assert.equal(selectVoice("PT-BR", TYPICAL).voice?.name, "Brazilian Portuguese")
    assert.equal(selectVoice("pt-BR", [v("PT-br", "Shouty")]).kind, "exact")
  })

  it("tolerates surrounding whitespace", () => {
    assert.equal(selectVoice("  pt-BR ", TYPICAL).kind, "exact")
    assert.equal(selectVoice("pt-BR", [v(" pt-BR ", "Padded")]).kind, "exact")
  })

  it("prefers the exact locale over a regional sibling, whatever the order", () => {
    const ptFirst = [v("pt-PT", "European"), v("pt-BR", "Brazilian")]
    assert.equal(selectVoice("pt-BR", ptFirst).voice?.name, "Brazilian")
    assert.equal(selectVoice("pt-PT", ptFirst).voice?.name, "European")
  })
})

/* ---- language fallback --------------------------------------------- */

describe("selectVoice — same language, different region", () => {
  it("falls back to pt-PT for pt-BR when that is all there is", () => {
    const m = selectVoice("pt-BR", [v("en-US", "English"), v("pt-PT", "European Portuguese")])
    assert.equal(m.voice?.name, "European Portuguese")
    assert.equal(m.kind, "language", "pt-PT is a fallback, not an equivalent")
  })

  it("falls back to a bare 'pt' voice", () => {
    const m = selectVoice("pt-BR", [v("pt", "Generic Portuguese")])
    assert.equal(m.kind, "language")
    assert.equal(m.voice?.name, "Generic Portuguese")
  })

  it("matches a regional voice for a bare requested language", () => {
    // "pt" and "pt-BR" are not the same LOCALE, so this is the
    // language tier, not the exact one — the request named no region
    // and the voice does.
    const m = selectVoice("pt", [v("en-US", "English"), v("pt-BR", "Brazilian")])
    assert.equal(m.voice?.name, "Brazilian")
    assert.equal(m.kind, "language")
  })

  it("still reports exact when the bare tag matches a bare voice", () => {
    assert.equal(selectVoice("pt", [v("pt", "Generic")]).kind, "exact")
  })
})

/* ---- no match ------------------------------------------------------ */

describe("selectVoice — nothing suitable", () => {
  it("returns none when no voice shares the language", () => {
    const m = selectVoice("ja-JP", TYPICAL)
    assert.equal(m.kind, "none")
    assert.equal(m.voice, null, "a wrong-language voice is worse than none at all")
  })

  it("returns none for an empty list", () => {
    assert.deepEqual(selectVoice("pt-BR", []), { voice: null, kind: "none" })
  })

  it("returns none for a null or undefined list", () => {
    // Safari's getVoices() before the list arrives.
    assert.equal(selectVoice("pt-BR", null).kind, "none")
    assert.equal(selectVoice("pt-BR", undefined).kind, "none")
  })

  it("a malformed locale yields no voice instead of throwing", () => {
    for (const bad of ["", "   ", "???", "1234", null, undefined, 42]) {
      const m = selectVoice(bad, TYPICAL)
      assert.equal(m.kind, "none", `${JSON.stringify(bad)} must not match`)
      assert.equal(m.voice, null)
    }
  })

  it("survives voices with a missing or non-string lang", () => {
    const messy = [
      { name: "No lang" } as unknown as SpeechSynthesisVoiceLike,
      { lang: null, name: "Null lang" } as unknown as SpeechSynthesisVoiceLike,
      { lang: "", name: "Empty lang" } as unknown as SpeechSynthesisVoiceLike,
      v("pt-BR", "The real one"),
    ]
    const m = selectVoice("pt-BR", messy)
    assert.equal(m.voice?.name, "The real one", "one malformed entry must not discard the list")
  })
})

/* ---- tiebreak ------------------------------------------------------ */

describe("selectVoice — the tiebreak is deterministic", () => {
  it("prefers a local voice over a remote one", () => {
    const m = selectVoice("pt-BR", [v("pt-BR", "Network"), v("pt-BR", "OnDevice", { localService: true })])
    assert.equal(m.voice?.name, "OnDevice", "a local voice starts faster and works offline")
  })

  it("prefers local+default over local alone", () => {
    const m = selectVoice("pt-BR", [
      v("pt-BR", "LocalOnly", { localService: true }),
      v("pt-BR", "LocalDefault", { localService: true, default: true }),
    ])
    assert.equal(m.voice?.name, "LocalDefault")
  })

  it("prefers the engine default when neither is local", () => {
    const m = selectVoice("pt-BR", [v("pt-BR", "Plain"), v("pt-BR", "Default", { default: true })])
    assert.equal(m.voice?.name, "Default")
  })

  it("falls back to list order for genuinely equal voices", () => {
    const equal = [v("pt-BR", "First"), v("pt-BR", "Second"), v("pt-BR", "Third")]
    assert.equal(selectVoice("pt-BR", equal).voice?.name, "First")
  })

  it("is stable — the same list always yields the same voice", () => {
    const list = [
      v("pt-BR", "A"),
      v("pt-BR", "B", { localService: true }),
      v("pt-BR", "C", { default: true }),
      v("pt-BR", "D", { localService: true, default: true }),
    ]
    const first = selectVoice("pt-BR", list).voice?.name
    for (let i = 0; i < 20; i += 1) {
      assert.equal(selectVoice("pt-BR", list).voice?.name, first, "selection must not vary between calls")
    }
    assert.equal(first, "D")
  })

  it("applies the same tiebreak inside the language-fallback tier", () => {
    const m = selectVoice("pt-BR", [v("pt-PT", "Remote"), v("pt-PT", "Local", { localService: true })])
    assert.equal(m.kind, "language")
    assert.equal(m.voice?.name, "Local")
  })

  it("does not mutate the list it was given", () => {
    const list = [v("pt-BR", "A"), v("pt-BR", "B", { localService: true })]
    const before = list.map((x) => x.name)
    selectVoice("pt-BR", list)
    assert.deepEqual(list.map((x) => x.name), before, "sorting must not reorder the caller's array")
  })
})

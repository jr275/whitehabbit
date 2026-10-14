/* ================================================================== *
 * TWO LANGUAGES, NEITHER OF THEM AN AFTERTHOUGHT.
 *
 * `Dictionary = typeof en` with `ptBR: Dictionary` already makes a
 * MISSING key a compile error, so nothing here re-checks that — the
 * build does it, earlier and better. What a type cannot see is the
 * prose: a key that exists but is blank, a Portuguese value that is
 * still the English one, a plural that forgot to inflect, a sentence
 * that dropped the number it was supposed to carry. Each of those
 * ships a half-translated screen past a green typecheck.
 *
 * So these tests walk every leaf of both dictionaries and assert the
 * properties the type system is blind to, plus the negotiation that
 * decides which language a first-time reader is shown.
 * ================================================================== */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DICTIONARIES, en, ptBR } from "@/lib/knowledge/i18n/dictionary"
import {
  htmlLang,
  isLocale,
  LOCALE_NAMES,
  LOCALES,
  negotiateLocale,
  parseLocale,
  resolveLocale,
  type Locale,
} from "@/lib/knowledge/i18n/locale"
/* From ./i18n/format, not ./config: config owns the per-kind icons and
 * so imports lucide-react, which cannot load in this process. That is
 * exactly why these functions were moved there. */
import { durationLabel, kindLabel, savedAgo } from "@/lib/knowledge/i18n/format"
import type { KnowledgeKind } from "@/lib/knowledge/types"

type Leaf = { path: string; en: string; pt: string }

/** Call a plural/interpolating entry without knowing its parameter
 *  types. Both probes return a string; the one that does not throw is
 *  the signature. Enough to read the prose, which is all this needs. */
function render(fn: unknown): string {
  const f = fn as (...a: unknown[]) => unknown
  for (const probe of [7, "7"]) {
    try {
      const out = f(...Array.from({ length: f.length }, () => probe))
      if (typeof out === "string") return out
    } catch {
      /* wrong probe type for this signature — try the other */
    }
  }
  assert.fail(`a dictionary entry was neither a string nor callable: ${String(fn)}`)
}

/** Every string Keeply can show, paired across the two languages. */
function leaves(): Leaf[] {
  const out: Leaf[] = []
  const walk = (a: unknown, b: unknown, path: string[]): void => {
    if (typeof a === "function" || typeof a === "string") {
      out.push({
        path: path.join("."),
        en: typeof a === "string" ? a : render(a),
        pt: typeof b === "string" ? b : render(b),
      })
      return
    }
    for (const key of Object.keys(a as object)) {
      walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], [...path, key])
    }
  }
  walk(en, ptBR, [])
  return out
}

const ALL = leaves()

describe("the dictionary says something in both languages", () => {
  it("covers a surface worth translating", () => {
    // A guard on the walk itself: if a refactor made `leaves()` return
    // a handful of entries, every test below would pass vacuously.
    assert.ok(ALL.length > 300, `expected the dictionary to be walked, got ${ALL.length} entries`)
  })

  it("never shows a blank where a sentence belongs", () => {
    for (const { path, en: e, pt } of ALL) {
      assert.ok(e.trim().length > 0, `${path} is blank in English`)
      assert.ok(pt.trim().length > 0, `${path} is blank in Portuguese`)
    }
  })

  it("is actually translated, not copied", () => {
    /* The only strings that are legitimately the same in both
     * languages: two file-type names Brazilian Portuguese borrows whole,
     * the minute abbreviation, which is "min" in both, and the product's
     * own name, which is not translated anywhere. Anything NEW appearing
     * here is an untranslated leftover, so the list is exact rather than
     * a threshold. */
    const SAME_IN_BOTH = new Set([
      "kinds.pdf",
      "kinds.podcast",
      "time.minutes",
      "library.filters.pdf",
      "library.filters.podcast",
      "meta.appTitle", // "Keeply"
      "meta.connectionsTitle", // "Keeply"
    ])
    const copied = ALL.filter((l) => l.en === l.pt).map((l) => l.path)
    assert.deepEqual(
      copied.filter((p) => !SAME_IN_BOTH.has(p)),
      [],
      "these read identically in both languages — translate them, or add them to SAME_IN_BOTH with a reason",
    )
    for (const path of SAME_IN_BOTH) {
      assert.ok(
        copied.includes(path),
        `${path} is now translated — remove it from SAME_IN_BOTH so the next leftover is still caught`,
      )
    }
  })

  it("never drops a value one language chose to show", () => {
    /* Not "every function prints its argument" — `ask.insufficientBody`
     * takes the retrieved count and deliberately says none of it, because
     * the sentence is about the refusal, not the arithmetic. The real
     * invariant is narrower and catches the actual mistake: where ENGLISH
     * shows the value, Portuguese must show it too. A translation that
     * quietly drops the number leaves the reader asking "how many?". */
    for (const { path, en: e, pt } of ALL) {
      if (!e.includes("7")) continue
      assert.ok(pt.includes("7"), `${path} shows the value in English ("${e}") but not in Portuguese ("${pt}")`)
    }
  })

  it("inflects the plurals that both languages inflect", () => {
    // These are the entries written as `count === 1 ? … : …`. If a
    // translation collapsed both arms, the singular reads wrong forever.
    const INFLECTED: [string, (d: typeof en) => (c: number, f: string) => string][] = [
      ["topicsPage.pieces", (d) => d.topicsPage.pieces],
      ["home.favourites", (d) => d.home.favourites],
      ["topicsPage.surfaced", (d) => d.topicsPage.surfaced],
      ["understand.themes_n", (d) => d.understand.themes_n],
      ["understand.concepts_n", (d) => d.understand.concepts_n],
      ["understand.questions_n", (d) => d.understand.questions_n],
    ]
    for (const [locale, d] of Object.entries(DICTIONARIES) as [Locale, typeof en][]) {
      for (const [path, pick] of INFLECTED) {
        const one = pick(d)(1, "1")
        const many = pick(d)(2, "2")
        assert.notEqual(one, many, `${locale} ${path} reads the same for 1 and 2`)
      }
    }
  })

  it("shows every kind of thing a reader can save", () => {
    // Driven off the dictionary's own `kinds` block, so a seventh kind
    // added to the product fails here until both languages name it.
    const kinds = Object.keys(en.kinds) as KnowledgeKind[]
    assert.ok(kinds.length >= 6, `expected the kinds to be enumerated, got ${kinds.length}`)
    for (const [locale, d] of Object.entries(DICTIONARIES)) {
      for (const kind of kinds) {
        assert.ok(kindLabel(d, kind).trim().length > 0, `${locale} has no name for a ${kind}`)
      }
    }
  })

  it("names both languages in their own language", () => {
    // A language offered in a language you cannot read is not a choice.
    assert.equal(LOCALE_NAMES["pt-BR"], "Português")
    assert.equal(LOCALE_NAMES.en, "English")
    for (const locale of LOCALES) assert.ok(LOCALE_NAMES[locale], `no name for ${locale}`)
  })
})

describe("a first-time reader gets the language their browser asked for", () => {
  it("reads Portuguese for any Portuguese region", () => {
    // Region mismatch must not fall back to English: a reader who asked
    // for pt-PT reads Portuguese far better than English.
    for (const header of ["pt-BR", "pt-BR,pt;q=0.9", "pt", "pt-PT", "PT-br", "pt-PT,en;q=0.5"]) {
      assert.equal(negotiateLocale(header), "pt-BR", header)
    }
  })

  it("reads English for English, for anything else, and for silence", () => {
    for (const header of ["en", "en-US,en;q=0.9", "fr-FR,fr;q=0.9", "de", "", null, undefined, "   "]) {
      assert.equal(negotiateLocale(header), "en", String(header))
    }
  })

  it("honours the q-order rather than the written order", () => {
    assert.equal(negotiateLocale("en;q=0.2,pt-BR;q=0.9"), "pt-BR")
    assert.equal(negotiateLocale("pt;q=0.3,en-GB;q=0.8"), "en")
  })

  it("ignores a language the browser explicitly refused", () => {
    // q=0 means "not this one", so pt must not win here.
    assert.equal(negotiateLocale("pt;q=0,fr;q=0.9"), "en")
  })

  it("survives a malformed header instead of throwing", () => {
    for (const header of [",,,", ";q=0.9", "pt;q=banana", "pt;;q=", "x".repeat(300)]) {
      assert.ok(LOCALES.includes(negotiateLocale(header)), header.slice(0, 20))
    }
  })
})

describe("a stored choice outranks the browser", () => {
  it("uses the cookie when it holds a language we speak", () => {
    assert.equal(resolveLocale("en", "pt-BR"), "en")
    assert.equal(resolveLocale("pt-BR", "en-US"), "pt-BR")
  })

  it("falls through to the header when the cookie is absent or junk", () => {
    assert.equal(resolveLocale(undefined, "pt-BR"), "pt-BR")
    assert.equal(resolveLocale("", "pt-BR"), "pt-BR")
    assert.equal(resolveLocale("klingon", "pt-BR"), "pt-BR")
    assert.equal(resolveLocale("pt-PT", "en"), "en", "an unsupported cookie value is not a choice")
  })

  it("answers with a language under every input", () => {
    assert.equal(parseLocale("nope"), null)
    assert.equal(parseLocale(undefined), null)
    assert.equal(isLocale("pt-BR"), true)
    assert.equal(isLocale("pt"), false)
    for (const locale of LOCALES) assert.equal(htmlLang(locale), locale)
  })
})

describe("dates and durations are read in the reader's language", () => {
  const now = new Date("2026-03-10T12:00:00Z")
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString()

  it("says today and yesterday without a number", () => {
    for (const [locale, d] of Object.entries(DICTIONARIES) as [Locale, typeof en][]) {
      assert.equal(savedAgo(d, locale, iso(0), now), d.time.savedToday)
      assert.equal(savedAgo(d, locale, iso(1), now), d.time.savedYesterday)
    }
  })

  it("phrases an older date with the platform's own relative formatter", () => {
    // Not a hand-rolled "3 days ago": Intl knows that Portuguese says
    // "há 3 dias" and where the preposition goes.
    const pt = savedAgo(ptBR, "pt-BR", iso(3), now)
    const engl = savedAgo(en, "en", iso(3), now)
    assert.notEqual(pt, engl)
    assert.match(pt, /3/)
    assert.match(engl, /3/)
    assert.match(savedAgo(en, "en", iso(21), now), /week/)
  })

  it("reads a listen as minutes and an article as minutes of reading", () => {
    for (const [locale, d] of Object.entries(DICTIONARIES) as [Locale, typeof en][]) {
      assert.equal(durationLabel(d, "article", undefined), null, `${locale}: no duration, no label`)
      assert.equal(durationLabel(d, "article", 0), null, `${locale}: zero is not a duration`)
      assert.notEqual(
        durationLabel(d, "article", 9),
        durationLabel(d, "podcast", 9),
        `${locale} must distinguish reading from listening`,
      )
      assert.match(durationLabel(d, "podcast", 9) ?? "", /9/)
    }
  })

  it("formats a thousand the way each language writes it", () => {
    assert.equal((1234).toLocaleString("en"), "1,234")
    assert.equal((1234).toLocaleString("pt-BR"), "1.234")
  })
})

describe("every locale resolves to a dictionary", () => {
  it("has one for each language and no orphan", () => {
    assert.deepEqual(Object.keys(DICTIONARIES).sort(), [...LOCALES].sort())
    for (const locale of LOCALES) assert.ok(DICTIONARIES[locale], `no dictionary for ${locale}`)
  })
})

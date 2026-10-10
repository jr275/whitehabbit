/* ================================================================== *
 * VOICE SELECTION — which installed voice should read this article.
 *
 * A pure function over a list. No DOM, no speechSynthesis, no React:
 * the browser hands us an array, and the only question is which entry
 * best matches the language the article declared. That makes the
 * policy testable against fabricated voice lists rather than against
 * whatever happens to be installed on the machine running the suite —
 * which is the difference between a test and a coincidence.
 *
 * WHY A VOICE AT ALL, when utterance.lang already exists. Setting lang
 * alone leaves the choice to the engine, and engines disagree: some
 * pick a matching voice, some read Portuguese with the system default
 * English voice and sound like nonsense. Naming the voice removes the
 * guess where we can, and leaving it unset where we cannot is the
 * honest fallback — never a wrong-language voice chosen on purpose.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: match on voice NAME. "Google
 * português do Brasil", "Luciana", "Joana" — the names differ per
 * platform, per OS version and per what the user installed. A policy
 * built on them is a policy that works on one machine.
 * ================================================================== */

/** The part of SpeechSynthesisVoice this policy reads. Narrow on
 *  purpose: the real browser object satisfies it as-is, and a test can
 *  build one as a literal. `default` and `localService` are optional
 *  because not every engine reports them honestly, and the policy must
 *  not depend on a field that may be missing. */
export interface SpeechSynthesisVoiceLike {
  /** BCP-47 tag, e.g. "pt-BR". Engines are inconsistent about case. */
  lang: string
  name: string
  /** True for a voice installed on the device rather than served from
   *  a network engine. Where it is reported, a local voice is the one
   *  that keeps working offline and starts without a round trip. */
  localService?: boolean
  /** The engine's own default for its language. */
  default?: boolean
}

/** How a voice was matched — surfaced so a caller can log or explain
 *  the choice without re-deriving it. */
export type VoiceMatchKind =
  /** Same locale, e.g. pt-BR for pt-BR. */
  | "exact"
  /** Same language, different region: pt-PT for pt-BR. Understandable,
   *  not equivalent — see the note on regional fallback below. */
  | "language"
  /** Nothing in the list shares the requested language. */
  | "none"

export interface VoiceMatch {
  voice: SpeechSynthesisVoiceLike | null
  kind: VoiceMatchKind
}

/**
 * The base language of a BCP-47 tag, lowercased, or null when the tag
 * is not one.
 *
 * Deliberately strict about the SHAPE and permissive about the rest: a
 * primary subtag is 2–3 letters (ISO 639-1/639-2), and anything else —
 * "", "x", "123", "pt_BR" with an underscore, a stray object coerced
 * to a string — is not a language we can reason about. Returning null
 * there is what keeps a malformed `lang` from silently matching
 * everything, or nothing, by accident.
 */
export function baseLanguageOf(tag: unknown): string | null {
  if (typeof tag !== "string") return null
  const trimmed = tag.trim()
  if (trimmed === "") return null
  const primary = trimmed.split("-")[0].toLowerCase()
  return /^[a-z]{2,3}$/.test(primary) ? primary : null
}

/** Case-insensitive locale equality. Engines report "pt-BR", "pt-br"
 *  and occasionally "PT-BR" for the same voice. */
function sameLocale(a: string, b: unknown): boolean {
  return typeof b === "string" && a.toLowerCase() === b.trim().toLowerCase()
}

/**
 * Rank within a tier, so two equally-matching voices resolve the same
 * way on every render and in every test.
 *
 * Lower sorts first:
 *   0. local AND the engine's default for its language
 *   1. local
 *   2. the engine's default
 *   3. everything else
 *
 * A local voice outranks a remote one because it starts without a
 * network round trip and keeps working offline — the two things a
 * reader notices. Ties beyond this fall back to the list's own order,
 * which is stable for a given browser session.
 */
function tiebreak(voice: SpeechSynthesisVoiceLike): number {
  const local = voice.localService === true
  const preferred = voice.default === true
  if (local && preferred) return 0
  if (local) return 1
  if (preferred) return 2
  return 3
}

/** Stable sort by tiebreak, preserving the engine's own order for
 *  equals. Array.prototype.sort is stable in every engine this runs
 *  on, but the index is kept explicit rather than assumed. */
function bestOf(candidates: SpeechSynthesisVoiceLike[]): SpeechSynthesisVoiceLike | null {
  if (candidates.length === 0) return null
  return candidates
    .map((voice, index) => ({ voice, index, rank: tiebreak(voice) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)[0].voice
}

/**
 * Pick the voice that best matches `requestedLang`.
 *
 * THE ORDER IS THE POLICY, and it is deliberate:
 *
 *   1. EXACT LOCALE. pt-BR for a pt-BR article, case-insensitively.
 *
 *   2. SAME LANGUAGE, DIFFERENT REGION. pt-PT for a pt-BR article.
 *      This is a fallback, not an equivalence: Brazilian and European
 *      Portuguese differ audibly, and a reader will hear it. It is
 *      still far better than an English voice reading Portuguese, so
 *      it is used — and reported as "language", never as "exact", so
 *      nothing downstream can mistake one for the other.
 *
 *   3. NOTHING. The caller leaves utterance.voice unset and the engine
 *      falls back to its own default for utterance.lang. That is the
 *      honest outcome: picking a voice in the wrong language would be
 *      worse than letting the browser decide.
 *
 * A missing or malformed `requestedLang` yields "none" rather than an
 * error. A locale we cannot parse is not a reason to stop reading.
 */
export function selectVoice(
  requestedLang: unknown,
  voices: readonly SpeechSynthesisVoiceLike[] | null | undefined,
): VoiceMatch {
  const none: VoiceMatch = { voice: null, kind: "none" }
  if (!voices || voices.length === 0) return none

  const base = baseLanguageOf(requestedLang)
  if (base === null) return none
  const requested = (requestedLang as string).trim()

  // Guard against entries whose lang is missing or not a string: a
  // single malformed voice must not throw out the whole list.
  const usable = voices.filter((v) => v && typeof v.lang === "string" && v.lang.trim() !== "")

  const exact = bestOf(usable.filter((v) => sameLocale(requested, v.lang)))
  if (exact) return { voice: exact, kind: "exact" }

  const sameLanguage = bestOf(usable.filter((v) => baseLanguageOf(v.lang) === base))
  if (sameLanguage) return { voice: sameLanguage, kind: "language" }

  return none
}

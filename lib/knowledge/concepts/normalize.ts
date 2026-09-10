/* ================================================================== *
 * CONCEPT NORMALIZATION — the deduplication rule, written once.
 *
 * "AI", "A.I.", "Artificial  Intelligence" and "artificial-
 * intelligence" must not become four concepts. This module decides
 * when two names are the same subject, and it does so DETERMINISTICALLY
 * — no model is asked, now or later. That matters for three reasons:
 * the answer must be the same on every run, the unique index in
 * migration 0010 is built on its output (so a non-deterministic
 * function would produce duplicate-key errors rather than duplicates),
 * and "why were these merged?" must be answerable without inference.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not expand acronyms, know
 * synonyms, stem, or translate. "AI" and "Artificial Intelligence"
 * stay distinct here. Collapsing them is a semantic judgement, and a
 * wrong one silently merges two subjects with no way to tell after the
 * fact — a later pass with real evidence can propose merges; this
 * function may not guess at them.
 * ================================================================== */

/** The closed vocabulary. Small on purpose: every type here has to be
 *  distinguishable by a model reading a document, and a taxonomy with
 *  fifty entries produces disagreement rather than precision. Mirrored
 *  by the CHECK constraint in migration 0010. */
export const CONCEPT_TYPES = [
  "TOPIC",
  "CONCEPT",
  "ENTITY",
  "TECHNOLOGY",
  "PERSON",
  "ORGANIZATION",
  "PRODUCT",
] as const

export type ConceptType = (typeof CONCEPT_TYPES)[number]

export function isConceptType(value: unknown): value is ConceptType {
  return typeof value === "string" && (CONCEPT_TYPES as readonly string[]).includes(value)
}

/** Longer than this is a sentence, not a concept name. The cap is
 *  enforced before storage so one bad extraction cannot write a
 *  paragraph into a column the UI renders as a chip. */
export const MAX_CONCEPT_NAME_CHARS = 120

/* ---- the normalizer ------------------------------------------------ */

/** Punctuation that separates words rather than joining them. A hyphen
 *  in "artificial-intelligence" is a separator; an apostrophe in
 *  "O'Reilly" is part of the word. Treating both the same would either
 *  split a name or glue two together. */
const SEPARATORS = /[\s \-–—_/\\|,;:()[\]{}"“”]+/g

/** Trailing punctuation a model tends to leave attached. */
const EDGE_PUNCTUATION = /^[.!?'`´]+|[.!?'`´]+$/g

/**
 * Maps a display name to its comparison key.
 *
 *   normalize("  Artificial   Intelligence ")  -> "artificial intelligence"
 *   normalize("Artificial-Intelligence")       -> "artificial intelligence"
 *   normalize("A.I.")                          -> "ai"
 *   normalize("MCP")                           -> "mcp"
 *   normalize("Café")                          -> "cafe"
 *
 * Returns "" for anything that normalizes away to nothing; callers
 * treat that as "not a concept" rather than storing an empty key.
 */
export function normalizeConceptName(raw: string): string {
  if (typeof raw !== "string") return ""

  return (
    raw
      // Unicode first: "café" composed and decomposed are the same
      // word, and NFKD also folds ligatures and full-width forms that
      // would otherwise produce a second row for one name.
      .normalize("NFKD")
      // Strip combining marks left by NFKD, so accented and unaccented
      // spellings of the same term collapse.
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      // Dots inside a word are abbreviation punctuation ("A.I." -> "ai"),
      // not separators — remove rather than split on them.
      .replace(/\.(?=\S)/g, "")
      .replace(SEPARATORS, " ")
      .replace(EDGE_PUNCTUATION, "")
      .replace(/\s+/g, " ")
      .trim()
  )
}

/** The display form. Whitespace is tidied and the length capped, but
 *  the author's capitalisation is left alone — "MCP" must not become
 *  "Mcp", and no casing rule can tell an acronym from a word. */
export function canonicalConceptName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_CONCEPT_NAME_CHARS)
}

/**
 * Collapses a batch to one entry per normalized name, keeping the
 * highest-confidence occurrence and unioning its evidence.
 *
 * This runs BEFORE the database so a single extraction that mentions
 * "AI agents" three times writes one association rather than racing
 * itself against the unique index.
 */
export function dedupeByNormalizedName<T extends { name: string; confidence: number }>(
  items: T[],
  mergeEvidence: (a: T, b: T) => T,
): T[] {
  const byKey = new Map<string, T>()
  for (const item of items) {
    const key = normalizeConceptName(item.name)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, item)
      continue
    }
    // Keep the stronger claim's name and confidence, but never lose
    // the weaker one's evidence — two passages supporting the same
    // concept is a better-supported concept, not a contest.
    const winner = item.confidence > existing.confidence ? item : existing
    const loser = item.confidence > existing.confidence ? existing : item
    byKey.set(key, mergeEvidence(winner, loser))
  }
  return [...byKey.values()]
}

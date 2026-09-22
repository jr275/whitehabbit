/* ================================================================== *
 * CONCEPT EXTRACTION CONTRACT — the gate a model's output must pass
 * before it can reach the database.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the LLM never writes. It
 * produces text; this module decides whether that text describes
 * something storable, and rejects everything else. A model that
 * returns a confidence of 4, an empty name, a concept type it invented,
 * or evidence pointing at a chunk from someone else's document does not
 * get a partial write — it gets a rejection with a field name.
 *
 * Validation style is the project's own (see parseKnowledgeAnswer in
 * lib/knowledge/ai.ts): hand-written narrowing guards, one error
 * carrying the offending field. No new validation framework is
 * introduced, deliberately — a second one would mean two places to
 * check when something is wrong.
 * ================================================================== */

import { canonicalConceptName, isConceptType, normalizeConceptName, type ConceptType } from "./normalize"

/** Where an association came from. Closed here and by the CHECK in
 *  migration 0010, so no writer can invent a provenance. */
export type ConceptSource = "llm" | "rule" | "user"

/** A pointer into knowledge_chunks — never a copy of the passage. The
 *  chunk already holds the text exactly once; duplicating it here
 *  would let a quote drift away from the document it claims to quote. */
export interface ConceptEvidence {
  chunkId: string
}

/** One concept the extractor claims to have found. */
export interface ExtractedConcept {
  name: string
  /** The display spelling, whitespace-tidied and length-capped. */
  canonicalName: string
  /** The comparison key — what deduplication and the unique index use. */
  normalizedName: string
  type: ConceptType
  /** 0..1 inclusive. */
  confidence: number
  evidence: ConceptEvidence[]
}

export class MalformedConceptError extends Error {
  readonly field: string
  constructor(field: string, detail?: string) {
    super(`Concept extraction returned a malformed ${field}${detail ? `: ${detail}` : ""}.`)
    this.name = "MalformedConceptError"
    this.field = field
  }
}

/* ---- guards -------------------------------------------------------- */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function str(v: unknown): v is string {
  return typeof v === "string"
}

/* ---- limits -------------------------------------------------------- */

/** More than this from one document is noise, not understanding. The
 *  cap is applied after sorting by confidence, so what survives is the
 *  strongest set rather than the first N the model happened to emit. */
export const MAX_CONCEPTS_PER_ITEM = 12

/** Below this the extractor is guessing. Rejected rather than stored
 *  with a low score, because a stored concept becomes a fact the rest
 *  of the product treats as real — relatedness, clustering, counts. */
export const MIN_CONFIDENCE = 0.35

/**
 * Parses one concept from raw model output.
 *
 * `knownChunkIds` is REQUIRED, not optional. Evidence is the only thing
 * making a concept checkable, so it is verified against the chunks that
 * were actually sent to the model: a chunk id the model produced from
 * nowhere is a fabricated citation, and an id belonging to a different
 * document would be a cross-document — potentially cross-owner —
 * reference smuggled in through a JSON field.
 */
export function parseExtractedConcept(raw: unknown, knownChunkIds: ReadonlySet<string>): ExtractedConcept {
  if (!isObj(raw)) throw new MalformedConceptError("concept")

  if (!str(raw.name)) throw new MalformedConceptError("name")
  const canonicalName = canonicalConceptName(raw.name)
  const normalizedName = normalizeConceptName(raw.name)
  // A name that normalizes to nothing ("...", "—") is punctuation, not
  // a subject, and would violate the NOT NULL/length CHECK downstream.
  if (!canonicalName || !normalizedName) throw new MalformedConceptError("name", "empty after normalization")

  if (!isConceptType(raw.type)) {
    throw new MalformedConceptError("type", str(raw.type) ? raw.type : typeof raw.type)
  }

  if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence)) {
    throw new MalformedConceptError("confidence")
  }
  if (raw.confidence < 0 || raw.confidence > 1) {
    throw new MalformedConceptError("confidence", `${raw.confidence} is outside 0..1`)
  }

  if (!Array.isArray(raw.evidence)) throw new MalformedConceptError("evidence")
  const evidence: ConceptEvidence[] = []
  for (const e of raw.evidence) {
    if (!isObj(e) || !str(e.chunkId)) throw new MalformedConceptError("evidence", "entry is not { chunkId }")
    if (!knownChunkIds.has(e.chunkId)) {
      throw new MalformedConceptError("evidence", `cites ${e.chunkId}, which was not among the passages provided`)
    }
    if (!evidence.some((x) => x.chunkId === e.chunkId)) evidence.push({ chunkId: e.chunkId })
  }
  // A concept with no evidence cannot answer "why do you think this?".
  // That question is the whole point of storing provenance, so the
  // unanswerable case is refused rather than stored.
  if (evidence.length === 0) throw new MalformedConceptError("evidence", "no supporting passage")

  return { name: raw.name, canonicalName, normalizedName, type: raw.type, confidence: raw.confidence, evidence }
}

export interface ParsedExtraction {
  concepts: ExtractedConcept[]
  /** Entries the model produced that were rejected, and why. Surfaced
   *  rather than swallowed: a run where nine of ten concepts failed
   *  validation is a broken prompt, and silently storing the tenth
   *  would hide that indefinitely. */
  rejected: { reason: string }[]
}

/**
 * Parses a whole extraction response.
 *
 * One bad concept does not fail the batch — it is dropped and counted.
 * A malformed ENVELOPE does throw, because there is then nothing to
 * partially trust.
 */
export function parseExtraction(raw: unknown, knownChunkIds: ReadonlySet<string>): ParsedExtraction {
  if (!isObj(raw)) throw new MalformedConceptError("body")
  if (!Array.isArray(raw.concepts)) throw new MalformedConceptError("concepts")

  const concepts: ExtractedConcept[] = []
  const rejected: { reason: string }[] = []

  for (const entry of raw.concepts) {
    try {
      const concept = parseExtractedConcept(entry, knownChunkIds)
      if (concept.confidence < MIN_CONFIDENCE) {
        rejected.push({ reason: `confidence ${concept.confidence} below ${MIN_CONFIDENCE}` })
        continue
      }
      concepts.push(concept)
    } catch (err) {
      rejected.push({ reason: err instanceof Error ? err.message : "unparseable" })
    }
  }

  // Strongest first, then capped — so the limit keeps the best claims
  // rather than the earliest ones.
  concepts.sort((a, b) => b.confidence - a.confidence)
  if (concepts.length > MAX_CONCEPTS_PER_ITEM) {
    rejected.push({ reason: `${concepts.length - MAX_CONCEPTS_PER_ITEM} beyond the per-item cap` })
    concepts.length = MAX_CONCEPTS_PER_ITEM
  }

  return { concepts, rejected }
}

/** Strips the markdown fence models wrap JSON in, then parses. Returns
 *  null rather than throwing so the caller decides what unparseable
 *  output means for the job. */
export function parseExtractionJson(text: string): unknown | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

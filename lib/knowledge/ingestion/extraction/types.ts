/* ================================================================== *
 * EXTRACTION BOUNDARY
 *
 * The application must never couple to any one extractor's internals
 * (Phase 5 §13). Nothing graby-specific, nothing Wallabag-specific and
 * nothing PHP-specific crosses this interface. Adding an extractor —
 * YouTube, PDF, podcast — means writing one ContentExtractor; no
 * caller changes.
 *
 * SOURCE vs DERIVED
 *
 *   SOURCE   what the publisher actually said: title, authors, date,
 *            language, canonical URL, the article HTML itself. These
 *            are read out of the document.
 *
 *   DERIVED  what we computed about it: which method won, which
 *            ruleset version produced it, how confident that method
 *            is, word count, reading time. These are ours.
 *
 * The distinction matters because SOURCE data is re-derivable from the
 * archived raw artifact, while DERIVED data changes when our
 * extractors improve. Nothing here is AI-generated; there are no AI
 * fields in this milestone.
 * ================================================================== */

export interface ExtractionRequest {
  /** Used for base-URL resolution and site-config lookup. */
  url: string
  /** ALWAYS supplied by the caller. An extractor NEVER fetches — that
   * is what keeps the SSRF boundary in exactly one place. */
  html: string
}

/** Which implementation produced a result. Ordered best-first. */
export type ExtractionMethod = "graby" | "readability" | "metadata"

export interface ExtractionResult {
  // ---- SOURCE: read from the document -------------------------------
  title: string | null
  /** NOT yet sanitized. The pipeline sanitizes before persisting. */
  contentHtml: string | null
  contentText: string
  excerpt: string | null
  authors: string[]
  publishedAt: number | null
  language: string | null
  siteName: string | null
  /** <link rel="canonical"> or og:url — the publisher's own idea of
   * this page's address, which may differ from the URL we fetched. */
  canonicalUrl: string | null
  /** The lead image (og:image, or the first in-article image). */
  imageUrl: string | null
  faviconUrl: string | null
  /** Every in-article image URL, absolute. NOT downloaded — see §10 of
   * the M2 docs. Recorded so a future milestone can archive selected
   * images without re-extracting. */
  images: string[]

  // ---- DERIVED: computed by us --------------------------------------
  method: ExtractionMethod
  /** Full, comparable version string. Persisted on the content row so
   * any stored article can be traced to the exact ruleset that
   * produced it, and so a later improvement knows what to re-run. */
  extractorVersion: string
  /** True when a site-specific rule matched, rather than falling
   * through to a generic heuristic. Tracked so the corpus's value is
   * visible rather than assumed. */
  siteConfigMatched: boolean
  /** A DETERMINISTIC quality signal in [0,1] — not a probability and
   * not a model output. See scoreConfidence(). */
  confidence: number
}

export type ExtractionFailureCode = "extraction_empty" | "extraction_error" | "extractor_unavailable"

export class ExtractionError extends Error {
  readonly code: ExtractionFailureCode
  readonly userMessage: string

  // Explicit fields, not parameter properties — Node's strip-only type
  // stripping (which runs the test suite) does not support them.
  constructor(code: ExtractionFailureCode, userMessage: string) {
    super(userMessage)
    this.name = "ExtractionError"
    this.code = code
    this.userMessage = userMessage
  }
}

export interface ContentExtractor {
  readonly id: ExtractionMethod
  /** Cheap liveness check. A remote extractor reports false when it is
   * unreachable so the ladder falls through instead of stalling. */
  isAvailable(): Promise<boolean>
  extract(request: ExtractionRequest): Promise<ExtractionResult>
}

/**
 * A deterministic quality signal, so a caller can tell a confident
 * extraction from a thin one without re-reading the article.
 *
 * This is NOT a probability and NOT a model score. It is a documented
 * function of things we can observe: which method won, whether a
 * site-specific rule matched, and whether the result actually looks
 * like an article. Written down here so nobody later mistakes it for
 * something cleverer than it is.
 */
export function scoreConfidence(input: {
  method: ExtractionMethod
  siteConfigMatched: boolean
  wordCount: number
  hasTitle: boolean
  hasAuthors: boolean
  hasDate: boolean
}): number {
  let score = input.method === "graby" ? 0.6 : input.method === "readability" ? 0.4 : 0.15

  if (input.siteConfigMatched) score += 0.2 // a human wrote a rule for this domain
  if (input.wordCount >= 250) score += 0.1
  else if (input.wordCount < 80) score -= 0.15 // a stub, not an article
  if (input.hasTitle) score += 0.05
  if (input.hasAuthors) score += 0.03
  if (input.hasDate) score += 0.02

  return Math.max(0, Math.min(1, Number(score.toFixed(3))))
}

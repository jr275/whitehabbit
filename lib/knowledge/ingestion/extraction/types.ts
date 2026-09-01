/* ================================================================== *
 * EXTRACTION BOUNDARY
 *
 * The application must never become coupled to any one extractor's
 * internals (Phase 5 §13). Nothing Wallabag-specific — no graby types,
 * no PHP concepts, no site-config structures — may cross this
 * interface. Replacing the implementation means writing one
 * ContentExtractor; no caller changes.
 *
 * Milestone 1 ships tiers 2 and 3 (a Node readability heuristic and a
 * metadata-only fallback). Tier 1, the graby sidecar that carries
 * Wallabag's per-domain site-config corpus, slots in behind this same
 * interface in a later milestone — deliberately deferred here because
 * it needs a container, and Milestone 1 is zero-new-infrastructure.
 * ================================================================== */

export interface ExtractionRequest {
  /** Used for base-URL resolution and, later, site-config lookup. */
  url: string
  /** Always supplied by the caller. An extractor NEVER fetches — that
   * is what keeps the SSRF boundary in exactly one place. */
  html: string
}

export interface ExtractionResult {
  title: string | null
  /** NOT yet sanitized. The pipeline sanitizes before persisting. */
  contentHtml: string | null
  contentText: string
  excerpt: string | null
  authors: string[]
  publishedAt: number | null
  language: string | null
  siteName: string | null
  imageUrl: string | null
  faviconUrl: string | null
  /** Which tier produced this, recorded on the object. */
  extractor: string
}

export type ExtractionFailureCode = "extraction_empty" | "extraction_error"

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
  readonly id: string
  extract(request: ExtractionRequest): ExtractionResult | null
}

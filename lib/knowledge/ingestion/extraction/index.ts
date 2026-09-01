/* ================================================================== *
 * EXTRACTION TIER LADDER
 *
 *   tier 1  graby sidecar   services/extractor — Wallabag's ~1,960-rule
 *                           per-domain XPath site-config corpus. Remote,
 *                           optional; absent in dev and in tests.
 *   tier 2  readability     content-density heuristic, in-process
 *   tier 3  metadata        title/excerpt/cover, no body, in-process
 *
 * Every tier is a ContentExtractor. The ladder is the ONLY thing that
 * knows there is more than one, and the only place that decides when to
 * fall through — so adding a tier (PDF, YouTube, podcast) is a new
 * module plus one array entry.
 *
 * INVARIANTS
 *
 *   - No tier ever fetches. The caller supplies the bytes, which keeps
 *     the SSRF boundary in exactly one place (safe-fetch.ts).
 *   - Falling through is normal, not an error. Tier 1 being down is a
 *     quality regression, never an outage: tiers 2 and 3 are
 *     in-process and cannot be unavailable.
 *   - Sanitization happens HERE, once, for every tier — so no tier can
 *     forget to, and a compromised sidecar still cannot inject markup
 *     into a reader's page.
 * ================================================================== */

import { countWords, htmlToText, sanitizeHtml } from "./sanitize.ts"
import { grabyExtractor } from "./graby.ts"
import { metadataExtractor, readabilityExtractor } from "./local.ts"
import {
  ExtractionError,
  type ContentExtractor,
  type ExtractionMethod,
  type ExtractionRequest,
  type ExtractionResult,
} from "./types.ts"

export * from "./types.ts"
export { sanitizeHtml, htmlToText, countWords, readingTimeSeconds } from "./sanitize.ts"
export { grabyExtractor, extractorUrl } from "./graby.ts"
export { readabilityExtractor, metadataExtractor, LOCAL_EXTRACTOR_VERSION } from "./local.ts"

/** Best first. Order is the policy; everything else here is mechanism. */
export const EXTRACTION_LADDER: readonly ContentExtractor[] = [
  grabyExtractor,
  readabilityExtractor,
  metadataExtractor,
]

/** The tiers that need no network. Used when re-extracting in a context
 * that must not depend on the sidecar being up. */
export const LOCAL_LADDER: readonly ContentExtractor[] = [readabilityExtractor, metadataExtractor]

export interface ExtractOptions {
  /** Override the ladder. A test seam, and how re-extraction pins a
   * specific method when reproducing a stored result. */
  ladder?: readonly ContentExtractor[]
  /** Restrict to one method — re-extraction comparing tiers. */
  only?: ExtractionMethod
  /** Called each time a tier declines, so the caller can log which
   * tiers were tried without this module importing a logger. */
  onFallthrough?: (method: ExtractionMethod, reason: string) => void
}

/**
 * Run the ladder against already-fetched HTML.
 *
 * Returns the first tier's result, sanitized. Throws ExtractionError
 * only when EVERY tier declined — which in practice means the document
 * had neither a body nor a title, because tier 3 accepts almost
 * anything else.
 */
export async function extractContent(
  request: ExtractionRequest,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  if (typeof request.html !== "string" || request.html.trim().length === 0) {
    throw new ExtractionError("extraction_empty", "That page had no content we could read.")
  }

  const ladder = (options.ladder ?? EXTRACTION_LADDER).filter(
    (tier) => !options.only || tier.id === options.only,
  )
  if (ladder.length === 0) {
    throw new ExtractionError("extraction_error", "No extractor is configured for that request.")
  }

  let lastError: ExtractionError | null = null

  for (const tier of ladder) {
    try {
      if (!(await tier.isAvailable())) {
        options.onFallthrough?.(tier.id, "unavailable")
        continue
      }
      return finalize(await tier.extract(request))
    } catch (err) {
      // A tier declining is expected. A tier throwing something that is
      // not an ExtractionError is a bug in that tier — contain it here
      // rather than losing the remaining tiers to it.
      lastError =
        err instanceof ExtractionError
          ? err
          : new ExtractionError("extraction_error", "That page could not be read.")
      options.onFallthrough?.(tier.id, lastError.code)
    }
  }

  throw lastError ?? new ExtractionError("extraction_empty", "We couldn't read anything from that page.")
}

/**
 * One sanitization pass for every tier, plus text kept in step with the
 * HTML that actually gets stored. A tier's own word count fed its
 * confidence score; recomputing text here is what the reader sees.
 */
function finalize(result: ExtractionResult): ExtractionResult {
  if (!result.contentHtml) return { ...result, contentText: result.contentText ?? "" }

  const contentHtml = sanitizeHtml(result.contentHtml)
  const contentText = htmlToText(contentHtml)
  return {
    ...result,
    contentHtml: countWords(contentText) > 0 ? contentHtml : null,
    contentText,
  }
}

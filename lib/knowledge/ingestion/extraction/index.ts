/* ================================================================== *
 * EXTRACTION TIER LADDER
 *
 *   tier 1  graby sidecar        NOT IN MILESTONE 1 — needs a
 *                                container; carries Wallabag's
 *                                per-domain XPath site-config corpus
 *   tier 2  readability          content-density heuristic
 *   tier 3  metadata-only        title/excerpt/cover, no body
 *
 * Tier 3 matters as much as tier 1: Wallabag's most important
 * extraction behaviour is that a page it cannot parse still produces a
 * saved, visible, retryable entry (Phase 1 §F.2 step 11). We keep that
 * exactly — an object is never silently empty.
 * ================================================================== */

import { countWords, htmlToText, sanitizeHtml } from "./sanitize.ts"
import {
  extractAuthors,
  extractExcerpt,
  extractFaviconUrl,
  extractImageUrl,
  extractLanguage,
  extractPublishedAt,
  extractSiteName,
  extractTitle,
} from "./metadata.ts"
import { extractArticleHtml } from "./readability.ts"
import { ExtractionError, type ExtractionRequest, type ExtractionResult } from "./types.ts"

export * from "./types.ts"
export { sanitizeHtml, htmlToText, countWords, readingTimeSeconds } from "./sanitize.ts"

/** Below this, a "body" is a paywall stub or a nav page, not an article. */
const MIN_ARTICLE_WORDS = 50

/**
 * Extract structured content from already-fetched HTML.
 *
 * Never fetches: the caller supplies the bytes, which is what keeps
 * the SSRF boundary in exactly one place (lib/knowledge/ingestion/
 * safe-fetch.ts).
 */
export function extractContent(request: ExtractionRequest): ExtractionResult {
  const { html, url } = request

  if (typeof html !== "string" || html.trim().length === 0) {
    throw new ExtractionError("extraction_empty", "That page had no content we could read.")
  }

  let domain = ""
  try {
    domain = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    /* the URL was already validated upstream; a bad one here is not fatal */
  }

  const siteName = extractSiteName(html, domain)
  const title = extractTitle(html, siteName)
  const authors = extractAuthors(html)
  const publishedAt = extractPublishedAt(html)
  const language = extractLanguage(html)
  const imageUrl = extractImageUrl(html, url)
  const faviconUrl = extractFaviconUrl(html, url)

  // ---- tier 2: readability ----
  const articleHtml = extractArticleHtml(html)
  if (articleHtml) {
    const sanitized = sanitizeHtml(articleHtml)
    const text = htmlToText(sanitized)
    if (countWords(text) >= MIN_ARTICLE_WORDS) {
      return {
        title,
        contentHtml: sanitized,
        contentText: text,
        excerpt: extractExcerpt(html, text),
        authors,
        publishedAt,
        language,
        siteName,
        imageUrl,
        faviconUrl,
        extractor: "readability@1",
      }
    }
  }

  // ---- tier 3: metadata only ----
  // The object is still saved, visible and openable. It is honest
  // about having no body rather than presenting an empty article.
  const excerpt = extractExcerpt(html, "")
  if (!title && !excerpt) {
    throw new ExtractionError("extraction_empty", "We couldn't read anything from that page.")
  }

  return {
    title,
    contentHtml: null,
    contentText: "",
    excerpt,
    authors,
    publishedAt,
    language,
    siteName,
    imageUrl,
    faviconUrl,
    extractor: "metadata@1",
  }
}

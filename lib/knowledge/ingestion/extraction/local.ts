/* ================================================================== *
 * LOCAL EXTRACTORS — tiers 2 and 3.
 *
 * Both are pure: no I/O, no network, no dependencies. They run in the
 * same process as the caller, which is why they are always available
 * and why the ladder can never fall off the end.
 *
 *   tier 2  readability   content-density heuristic
 *   tier 3  metadata      title/excerpt/cover, no body
 *
 * Tier 3 matters as much as tier 1: the single most important
 * extraction behaviour we carried over from Wallabag is that a page it
 * cannot parse still produces a saved, visible, retryable entry
 * (Phase 1 §F.2 step 11). An object is never silently empty.
 * ================================================================== */

import { countWords, htmlToText } from "./sanitize.ts"
import {
  extractAuthors,
  extractCanonicalUrl,
  extractExcerpt,
  extractFaviconUrl,
  extractImageUrl,
  extractImages,
  extractLanguage,
  extractPublishedAt,
  extractSiteName,
  extractTitle,
} from "./metadata.ts"
import { extractArticleHtml } from "./readability.ts"
import {
  ExtractionError,
  scoreConfidence,
  type ContentExtractor,
  type ExtractionRequest,
  type ExtractionResult,
} from "./types.ts"

/** Below this, a "body" is a paywall stub or a nav page, not an
 * article, and tier 3 gives a more honest answer than tier 2 does. */
const MIN_ARTICLE_WORDS = 50

/** Version of THESE extractors. Bumped when their output changes, so
 * re-extraction knows which stored articles are stale. Independent of
 * the graby sidecar's version, which the sidecar reports itself. */
export const LOCAL_EXTRACTOR_VERSION = "1"

/** Every SOURCE field readable from the document without deciding what
 * the article body is. Shared by both local tiers — and deliberately
 * re-read from the ORIGINAL document rather than from any tier's
 * output, because every tier strips parts of the head. */
function readMetadata(html: string, url: string) {
  let domain = ""
  try {
    domain = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    /* the URL was validated upstream; a bad one here is not fatal */
  }

  const siteName = extractSiteName(html, domain)
  return {
    siteName,
    title: extractTitle(html, siteName),
    authors: extractAuthors(html),
    publishedAt: extractPublishedAt(html),
    language: extractLanguage(html),
    canonicalUrl: extractCanonicalUrl(html, url),
    imageUrl: extractImageUrl(html, url),
    faviconUrl: extractFaviconUrl(html, url),
  }
}

function requireHtml(request: ExtractionRequest): void {
  if (typeof request.html !== "string" || request.html.trim().length === 0) {
    throw new ExtractionError("extraction_empty", "That page had no content we could read.")
  }
}

/* ---- tier 2: readability ----------------------------------------- */

export const readabilityExtractor: ContentExtractor = {
  id: "readability",

  // In-process and dependency-free: it cannot be unavailable.
  async isAvailable(): Promise<boolean> {
    return true
  },

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    requireHtml(request)
    const { html, url } = request

    const articleHtml = extractArticleHtml(html)
    if (!articleHtml) {
      throw new ExtractionError("extraction_empty", "That page had no readable article.")
    }

    // NOT sanitized here: the ladder sanitizes every tier's output in
    // one place, so no tier can forget to.
    const contentHtml = articleHtml
    const contentText = htmlToText(contentHtml)
    const wordCount = countWords(contentText)
    if (wordCount < MIN_ARTICLE_WORDS) {
      throw new ExtractionError("extraction_empty", "That page had no readable article.")
    }

    const meta = readMetadata(html, url)
    return {
      ...meta,
      contentHtml,
      contentText,
      excerpt: extractExcerpt(html, contentText),
      images: extractImages(contentHtml, url),
      method: "readability",
      extractorVersion: `readability@${LOCAL_EXTRACTOR_VERSION}`,
      siteConfigMatched: false, // this tier has no per-domain rules
      confidence: scoreConfidence({
        method: "readability",
        siteConfigMatched: false,
        wordCount,
        hasTitle: Boolean(meta.title),
        hasAuthors: meta.authors.length > 0,
        hasDate: meta.publishedAt !== null,
      }),
    }
  },
}

/* ---- tier 3: metadata only --------------------------------------- */

export const metadataExtractor: ContentExtractor = {
  id: "metadata",

  async isAvailable(): Promise<boolean> {
    return true
  },

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    requireHtml(request)
    const { html, url } = request

    const meta = readMetadata(html, url)
    const excerpt = extractExcerpt(html, "")

    // Nothing at all — not even a title. Saving this would be a lie.
    if (!meta.title && !excerpt) {
      throw new ExtractionError("extraction_empty", "We couldn't read anything from that page.")
    }

    return {
      ...meta,
      // The object is still saved, visible and openable. It is honest
      // about having no body rather than presenting an empty article.
      contentHtml: null,
      contentText: "",
      excerpt,
      images: [],
      method: "metadata",
      extractorVersion: `metadata@${LOCAL_EXTRACTOR_VERSION}`,
      siteConfigMatched: false,
      confidence: scoreConfidence({
        method: "metadata",
        siteConfigMatched: false,
        wordCount: 0,
        hasTitle: Boolean(meta.title),
        hasAuthors: meta.authors.length > 0,
        hasDate: meta.publishedAt !== null,
      }),
    }
  },
}

import "server-only"

/* ================================================================== *
 * GRABY EXTRACTOR — tier 1.
 *
 * Talks to services/extractor over HTTP. That service wraps
 * j0k3r/graby and its ~1,960-rule site-config corpus: the Wallabag
 * extraction quality Phase 1 identified as the one asset worth
 * keeping, isolated behind a contract this file is the only consumer
 * of.
 *
 * NOTHING graby-specific escapes this module. Callers see an
 * ExtractionResult; if graby is ever replaced, only this file changes.
 *
 * SECURITY: this client sends bytes we already fetched. It never asks
 * the service to fetch anything, and the service has no egress. The
 * SSRF boundary stays in exactly one place (safe-fetch.ts).
 * ================================================================== */

import { htmlToText, countWords } from "./sanitize.ts"
import {
  cleanTitle,
  extractCanonicalUrl,
  extractExcerpt,
  extractFaviconUrl,
  extractImages,
  extractSiteName,
  extractTitle,
} from "./metadata.ts"
import {
  ExtractionError,
  scoreConfidence,
  type ContentExtractor,
  type ExtractionRequest,
  type ExtractionResult,
} from "./types.ts"

const DEFAULT_TIMEOUT_MS = 20_000
const HEALTH_TIMEOUT_MS = 2_000
/** How long a failed health check suppresses further attempts. */
const CIRCUIT_OPEN_MS = 60_000
const CONSECUTIVE_FAILURES_TO_OPEN = 5

interface GrabyOk {
  title: string | null
  html: string
  excerpt: string | null
  authors: string[]
  date: string | null
  language: string | null
  image: string | null
  siteName: string | null
  siteConfigMatched: boolean
  extractorVersion: string
  durationMs: number
}

/** Module-level circuit breaker: one dead service must not add 20s to
 * every single ingestion. */
let consecutiveFailures = 0
let circuitOpenedAt = 0

function circuitIsOpen(): boolean {
  if (consecutiveFailures < CONSECUTIVE_FAILURES_TO_OPEN) return false
  if (Date.now() - circuitOpenedAt > CIRCUIT_OPEN_MS) {
    consecutiveFailures = 0 // half-open: let the next call try
    return false
  }
  return true
}

function recordFailure(): void {
  consecutiveFailures += 1
  if (consecutiveFailures === CONSECUTIVE_FAILURES_TO_OPEN) circuitOpenedAt = Date.now()
}

function recordSuccess(): void {
  consecutiveFailures = 0
}

export function extractorUrl(): string | null {
  const raw = (process.env.EXTRACTOR_URL ?? "").trim()
  return raw.length > 0 ? raw.replace(/\/$/, "") : null
}

function parseDate(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  // Reject implausible values rather than storing a wrong date.
  if (parsed < Date.parse("1990-01-01") || parsed > Date.now() + 2 * 86_400_000) return null
  return parsed
}

/**
 * Drop a leading bare text node that just repeats the page title.
 *
 * When no site config matches, graby falls through to its own generic
 * heuristic and can return <body>'s serialization — which begins with
 * the <title>'s text as a loose text node, before the first element.
 * Left in, every such article opens by saying its own headline twice.
 *
 * Deliberately narrow: only a LEADING run of text before the first
 * tag, and only when it matches the title we are about to store. It
 * never touches an article's real first paragraph, and it never
 * second-guesses a site config's output.
 */
function dropLeadingTitleText(html: string, rawTitle: string | null): string {
  if (!rawTitle) return html
  const firstTag = html.indexOf("<")
  if (firstTag <= 0) return html

  const lead = html.slice(0, firstTag)
  const normalize = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase()
  if (normalize(lead).length === 0) return html
  return normalize(lead) === normalize(rawTitle) ? html.slice(firstTag) : html
}

export const grabyExtractor: ContentExtractor = {
  id: "graby",

  async isAvailable(): Promise<boolean> {
    const base = extractorUrl()
    if (!base || circuitIsOpen()) return false
    try {
      const res = await fetch(`${base}/healthz`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      })
      return res.ok
    } catch {
      return false
    }
  },

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const base = extractorUrl()
    if (!base) throw new ExtractionError("extractor_unavailable", "The extraction service is not configured.")
    if (circuitIsOpen()) throw new ExtractionError("extractor_unavailable", "The extraction service is unavailable.")

    let res: Response
    try {
      res = await fetch(`${base}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: request.url, html: request.html }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      })
    } catch {
      recordFailure()
      throw new ExtractionError("extractor_unavailable", "The extraction service is unavailable.")
    }

    if (res.status === 422) {
      // A determinate answer: graby read the document and found no
      // article. Never retried; the ladder falls through.
      recordSuccess()
      throw new ExtractionError("extraction_empty", "That page had no readable article.")
    }
    if (!res.ok) {
      recordFailure()
      throw new ExtractionError("extractor_unavailable", "The extraction service returned an error.")
    }

    let payload: GrabyOk
    try {
      payload = (await res.json()) as GrabyOk
    } catch {
      recordFailure()
      throw new ExtractionError("extraction_error", "The extraction service returned an unreadable response.")
    }
    recordSuccess()

    const contentHtml = dropLeadingTitleText(payload.html ?? "", payload.title)
    const contentText = htmlToText(contentHtml)
    const wordCount = countWords(contentText)

    // Graby gives us the article body and its own metadata. Fields it
    // does not report (favicon, canonical URL, the full image list) are
    // read from the ORIGINAL document, not from graby's output —
    // graby has already stripped much of the head.
    const images = extractImages(contentHtml, request.url)
    const imageUrl = payload.image ?? images[0] ?? null

    // Where graby reports nothing, fall back to the SAME metadata
    // readers the local tiers use. Turning the sidecar ON must never
    // cost us a field that tier 3 would have found.
    let domain = ""
    try {
      domain = new URL(request.url).hostname.replace(/^www\./, "")
    } catch {
      /* validated upstream */
    }
    const siteName = payload.siteName ?? extractSiteName(request.html, domain)
    const title = cleanTitle(payload.title, siteName) ?? extractTitle(request.html, siteName)

    return {
      title,
      contentHtml,
      contentText,
      excerpt: payload.excerpt ?? extractExcerpt(request.html, contentText),
      authors: Array.isArray(payload.authors) ? payload.authors.slice(0, 5) : [],
      publishedAt: parseDate(payload.date),
      language: payload.language ? payload.language.toLowerCase().replace(/_/g, "-").slice(0, 20) : null,
      siteName,
      canonicalUrl: extractCanonicalUrl(request.html, request.url),
      imageUrl,
      faviconUrl: extractFaviconUrl(request.html, request.url),
      images,
      method: "graby",
      extractorVersion: payload.extractorVersion ?? "graby@unknown",
      siteConfigMatched: Boolean(payload.siteConfigMatched),
      confidence: scoreConfidence({
        method: "graby",
        siteConfigMatched: Boolean(payload.siteConfigMatched),
        wordCount,
        hasTitle: Boolean(title),
        hasAuthors: (payload.authors ?? []).length > 0,
        hasDate: Boolean(payload.date),
      }),
    }
  },
}

/** Test seam: reset the breaker between cases. */
export function __resetCircuit(): void {
  consecutiveFailures = 0
  circuitOpenedAt = 0
}

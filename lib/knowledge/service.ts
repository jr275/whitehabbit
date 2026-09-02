import "server-only"

/* ================================================================== *
 * INGESTION SERVICE — the real save→fetch→extract→ready|failed
 * pipeline. Every outbound fetch goes through safeFetch (lib/security/
 * safe-fetch.ts), which revalidates EVERY redirect hop against the
 * shared SSRF guard and pins each connection to an address that guard
 * approved, bounded by a timeout and a response-size cap. The content
 * is extracted from real markup — never fabricated. State transitions
 * are persisted as they happen so a polling client observes genuine
 * progress (saved → fetching → extracting → ready|failed).
 * ================================================================== */

import { safeFetch, SafeFetchError, type SafeFetchOptions } from "@/lib/security/safe-fetch"
import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"
import { logger } from "@/lib/observability/logger"
import { extractFavicon, extractFromHtml } from "./extract"
import * as repo from "./repo"
import type { KnowledgeRow } from "./repo"
import { canonicalizeUrlSafe, InvalidKnowledgeUrlError, isCanonicalUrlTooLong, parseSaveableUrl } from "./url"

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 5_000_000 // 5 MB cap — enough for real articles, refuses payload bombs
const USER_AGENT = "WhitehabbitKnowledgeBot/1.0 (+https://whitehabbit.app)"
const FETCH_HEADERS = { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }

/**
 * Run one guarded fetch and translate its failure for a caller.
 *
 * The detail — which address a host resolved to, which redirect was
 * refused, which DNS error came back — is logged server-side and
 * NEVER returned. On the public preview endpoint those differences are
 * an oracle: repeat them over a wordlist and you have mapped an
 * internal network without ever getting a page back.
 */
export interface FetchDeps {
  /** Test seam only. The SSRF guard runs OUTSIDE the transport, on
   * every hop, so substituting it cannot weaken any check — it only
   * removes the socket. */
  transport?: SafeFetchOptions["transport"]
}

async function guardedFetch(
  url: string,
  context: string,
  deps: FetchDeps = {},
): Promise<{ body: Buffer; contentType: string }> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      headers: FETCH_HEADERS,
      transport: deps.transport,
    })
    return { body: res.body, contentType: res.contentType }
  } catch (err) {
    if (err instanceof SafeFetchError) {
      logger.warn("knowledge_fetch_refused", { context, code: err.code, detail: err.detail })
      throw new SaveValidationError(err.userMessage)
    }
    logger.error("knowledge_fetch_error", { context, message: err instanceof Error ? err.message : String(err) })
    throw new SaveValidationError("We couldn't read that page.")
  }
}

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SaveValidationError"
  }
}

/** Normalize + validate the user-submitted URL string into a real URL.
 * Adds https:// when the user omits a scheme (a very common paste).
 * Rejects a non-http(s) scheme and a URL carrying credentials — see
 * lib/knowledge/url.ts's parseSaveableUrl(), the one shared rule this
 * and guest-store.ts's own normalizeUrl() both enforce. */
export function normalizeUrl(input: string): string {
  let url: URL
  try {
    url = parseSaveableUrl(input)
  } catch (err) {
    if (err instanceof InvalidKnowledgeUrlError) throw new SaveValidationError(err.message)
    throw err
  }
  if (!url.hostname.includes(".")) throw new SaveValidationError("That doesn't look like a valid web address.")
  return url.toString()
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** The outcome of a save: the row, plus whether it was ALREADY in the
 * org's library (a re-save of the same page). When `duplicate` is true
 * the caller must NOT re-run the ingestion pipeline — it just opens the
 * existing item. */
export interface SaveResult {
  row: KnowledgeRow
  duplicate: boolean
}

/** Create the row immediately in `saved` state and return it, so the
 * API can respond instantly and the UI can render the new card — unless
 * the same page (by canonical dedup key) is already saved, in which case
 * the existing item is returned untouched with duplicate=true. The
 * caller schedules processItem() to run after the response only for a
 * genuinely new item. */
export async function saveUrl(params: { orgId: string; userId: string | null; url: string }): Promise<SaveResult> {
  const normalized = normalizeUrl(params.url)
  // Fail fast on obviously-unsafe URLs before we even persist, so the
  // user gets an immediate 400 rather than a row that will fail async.
  try {
    await assertSafeUrl(normalized)
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      // Generic on purpose. The guard's own message names the address a
      // host resolved to, which confirms that host exists — an oracle
      // an attacker can walk over a wordlist. The detail is logged.
      logger.warn("knowledge_save_refused", { detail: err.message })
      throw new SaveValidationError("We couldn't reach that address.")
    }
    throw err
  }

  const normalizedKey = canonicalizeUrlSafe(normalized)

  // The dedup key is indexed, and a btree index row has a hard byte
  // ceiling. Refuse here, before the database does: past the ceiling
  // Postgres raises an error saveUrl cannot interpret and the user gets
  // a 500 for a URL that will never save however often they retry.
  // Rejected, never truncated — a truncated key silently collides with
  // every other URL sharing its prefix, which turns "too long" into
  // "opens somebody else's article".
  if (normalizedKey && isCanonicalUrlTooLong(normalizedKey)) {
    throw new SaveValidationError("That URL is too long to save.")
  }

  // Already saved? Return the existing item rather than a duplicate.
  if (normalizedKey) {
    const existing = await repo.findByNormalizedUrl(params.orgId, normalizedKey)
    if (existing) return { row: existing, duplicate: true }
  }

  try {
    const row = await repo.insertSavedItem({
      orgId: params.orgId,
      userId: params.userId,
      url: normalized,
      normalizedUrl: normalizedKey,
      domain: domainOf(normalized),
    })
    return { row, duplicate: false }
  } catch (err) {
    // Race: a concurrent save inserted the same canonical URL first and
    // tripped the partial unique index. Resolve to that existing item
    // instead of surfacing a raw constraint error.
    if (normalizedKey && err instanceof Error && /duplicate key|unique/i.test(err.message)) {
      const existing = await repo.findByNormalizedUrl(params.orgId, normalizedKey)
      if (existing) return { row: existing, duplicate: true }
    }
    throw err
  }
}

/** Read-only page metadata — the DB-free counterpart to processItem().
 * Normalizes + SSRF-guards + size/timeout-caps the fetch, then returns
 * only the presentational metadata a card needs (never body text, never
 * secrets). Powers the public /api/knowledge/preview route so guest mode
 * can show a real thumbnail without doing (CORS-blocked, unsafe) browser
 * scraping. Throws SaveValidationError for bad/unsafe/unreachable URLs. */
export interface PageMetadata {
  url: string
  canonicalUrl: string | null
  domain: string | null
  title: string | null
  excerpt: string | null
  siteName: string | null
  author: string | null
  imageUrl: string | null
  favicon: string | null
  readingMin: number | null
  kind: string
}

export async function fetchPageMetadata(rawUrl: string, deps: FetchDeps = {}): Promise<PageMetadata> {
  const normalized = normalizeUrl(rawUrl)
  const fetchedRaw = await guardedFetch(normalized, "preview", deps)
  const fetched = { html: decodeUtf8(fetchedRaw.body), contentType: fetchedRaw.contentType }

  const domain = domainOf(normalized)
  const isHtml = /text\/html|application\/xhtml/i.test(fetched.contentType)
  if (!isHtml) {
    // A real resource but not HTML we can read metadata from (PDF, etc).
    return {
      url: normalized,
      canonicalUrl: null,
      domain,
      title: null,
      excerpt: null,
      siteName: domain,
      author: null,
      imageUrl: null,
      favicon: null,
      readingMin: null,
      kind: normalized.toLowerCase().endsWith(".pdf") ? "pdf" : "document",
    }
  }

  const x = extractFromHtml(fetched.html, normalized)
  const textKind = x.kind === "article" || x.kind === "document"
  return {
    url: normalized,
    canonicalUrl: x.canonicalUrl ?? null,
    domain,
    title: x.title ?? null,
    excerpt: x.excerpt ?? null,
    siteName: x.siteName ?? domain,
    author: x.author ?? null,
    imageUrl: x.imageUrl ?? null,
    favicon: extractFavicon(fetched.html, normalized) ?? null,
    readingMin: textKind ? (x.readingMin ?? null) : null,
    kind: x.kind,
  }
}

/** Decode a fetched body. Unchanged from the previous implementation:
 * UTF-8 regardless of the declared charset. Widening that is a content
 * change, not a security one, so it is left exactly as it was. */
function decodeUtf8(body: Buffer): string {
  return new TextDecoder("utf-8").decode(body)
}

/**
 * Run the ingestion pipeline for one saved item. Idempotent-ish: safe
 * to call again on a failed item (that's exactly what retry does).
 * Persists each transition; on any failure sets status=failed with a
 * real, human-readable reason. Never throws to its caller — a
 * background invocation must not crash the request that scheduled it.
 */
export async function processItem(id: string, orgId: string): Promise<void> {
  try {
    await repo.incrementAttempts(id, orgId)
    const item = await repo.getItem(id, orgId)
    if (!item) return // deleted before processing ran — nothing to do

    await repo.setStatus(id, orgId, "fetching")

    let fetched: { html: string; contentType: string }
    try {
      const raw = await guardedFetch(item.url, `ingest:${id}`)
      fetched = { html: decodeUtf8(raw.body), contentType: raw.contentType }
    } catch (err) {
      // guardedFetch has already logged the detail; what lands on the
      // row is the same message a stranger would see.
      const reason = err instanceof SaveValidationError ? err.message : "Could not fetch the source."
      await repo.setStatus(id, orgId, "failed", reason)
      return
    }

    await repo.setStatus(id, orgId, "extracting")

    const isHtml = /text\/html|application\/xhtml/i.test(fetched.contentType)
    const domain = item.domain ?? undefined

    if (!isHtml) {
      // Real content, but not an HTML page we can extract prose from
      // (PDF, video page without OG, etc). Persist it honestly as ready
      // with what we can derive — no fabricated body text.
      const kind = item.url.toLowerCase().endsWith(".pdf") ? "pdf" : "document"
      await repo.saveExtraction(id, orgId, {
        status: "ready",
        kind,
        title: domain ? `${domain} — saved file` : item.url,
        author: null,
        siteName: domain ?? null,
        excerpt: null,
        imageUrl: null,
        favicon: null,
        canonicalUrl: null,
        publishedAt: null,
        wordCount: null,
        readingMin: null,
        lang: null,
        contentText: null,
        rawHtml: null,
        tags: [],
      })
      return
    }

    const extracted = extractFromHtml(fetched.html, item.url)
    // Reading time is only honest for text kinds — never label a video
    // or PDF with an invented "N min read" derived from page chrome.
    const textKind = extracted.kind === "article" || extracted.kind === "document"
    await repo.saveExtraction(id, orgId, {
      status: "ready",
      kind: extracted.kind,
      title: extracted.title ?? (domain ? `Untitled — ${domain}` : "Untitled"),
      author: extracted.author ?? null,
      siteName: extracted.siteName ?? domain ?? null,
      excerpt: extracted.excerpt ?? null,
      imageUrl: extracted.imageUrl ?? null,
      favicon: extractFavicon(fetched.html, item.url) ?? null,
      canonicalUrl: extracted.canonicalUrl ?? null,
      publishedAt: extracted.publishedAt ?? null,
      wordCount: extracted.wordCount ?? null,
      readingMin: textKind ? (extracted.readingMin ?? null) : null,
      lang: extracted.lang ?? null,
      contentText: extracted.contentText ?? null,
      rawHtml: fetched.html.length <= MAX_BYTES ? fetched.html : null,
      tags: extracted.tags,
    })
  } catch (err) {
    // Last-resort guard: any unexpected error still leaves a real,
    // honest failed state rather than an item stuck "extracting".
    try {
      await repo.setStatus(id, orgId, "failed", err instanceof Error ? err.message : "Processing failed unexpectedly.")
    } catch {
      /* swallow — nothing else we can do in a background task */
    }
  }
}

import "server-only"

/* ================================================================== *
 * INGESTION SERVICE — the real save→fetch→extract→ready|failed
 * pipeline. Every outbound fetch is SSRF-guarded (lib/security/
 * ssrf-guard.ts) BEFORE the request leaves the server, bounded by a
 * timeout and a response-size cap, and the resulting content is
 * extracted from real markup — never fabricated. State transitions
 * are persisted as they happen so a polling client observes genuine
 * progress (saved → fetching → extracting → ready|failed).
 * ================================================================== */

import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"
import { extractFavicon, extractFromHtml } from "./extract"
import * as repo from "./repo"
import type { KnowledgeRow } from "./repo"
import { canonicalizeUrlSafe } from "./url"

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 5_000_000 // 5 MB cap — enough for real articles, refuses payload bombs
const USER_AGENT = "WhitehabbitKnowledgeBot/1.0 (+https://whitehabbit.app)"

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SaveValidationError"
  }
}

/** Normalize + validate the user-submitted URL string into a real URL.
 * Adds https:// when the user omits a scheme (a very common paste). */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new SaveValidationError("Enter a URL to save.")
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new SaveValidationError("That doesn't look like a valid URL.")
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
    if (err instanceof UnsafeUrlError) throw new SaveValidationError(err.message)
    throw err
  }

  const normalizedKey = canonicalizeUrlSafe(normalized)

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

export async function fetchPageMetadata(rawUrl: string): Promise<PageMetadata> {
  const normalized = normalizeUrl(rawUrl)
  let safe: URL
  try {
    safe = await assertSafeUrl(normalized)
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new SaveValidationError(err.message)
    throw err
  }

  let fetched: { html: string; contentType: string }
  try {
    fetched = await fetchWithLimits(safe)
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "The source took too long to respond."
        : err instanceof Error
          ? err.message
          : "Could not fetch the source."
    throw new SaveValidationError(reason)
  }

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

async function fetchWithLimits(url: URL): Promise<{ html: string; contentType: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    })
    if (!res.ok) throw new Error(`The source responded with ${res.status} ${res.statusText}.`)
    const contentType = res.headers.get("content-type") ?? ""

    // Read with a hard size cap rather than trusting Content-Length.
    const reader = res.body?.getReader()
    if (!reader) return { html: await res.text(), contentType }
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.length
        if (total > MAX_BYTES) {
          controller.abort()
          throw new Error("The source is too large to process.")
        }
        chunks.push(value)
      }
    }
    const buf = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      buf.set(c, offset)
      offset += c.length
    }
    return { html: new TextDecoder("utf-8").decode(buf), contentType }
  } finally {
    clearTimeout(timer)
  }
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

    let safe: URL
    try {
      safe = await assertSafeUrl(item.url)
    } catch (err) {
      const reason = err instanceof UnsafeUrlError ? err.message : "This URL cannot be fetched safely."
      await repo.setStatus(id, orgId, "failed", reason)
      return
    }

    let fetched: { html: string; contentType: string }
    try {
      fetched = await fetchWithLimits(safe)
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? "The source took too long to respond."
          : err instanceof Error
            ? err.message
            : "Could not fetch the source."
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

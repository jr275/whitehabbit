import "server-only"

/* ================================================================== *
 * GUARDED FETCH — the only way Pocket2 retrieves a user-supplied URL.
 *
 * URL ingestion is the most security-sensitive subsystem in this
 * product: the server is being asked to make an HTTP request to an
 * address a stranger chose. Everything here exists because of that.
 *
 *   SSRF          — every hop is checked with assertSafeUrl(), which
 *                   resolves DNS and inspects the RESOLVED address, so
 *                   a public-looking host that points at 10.x or at
 *                   169.254.169.254 is refused.
 *   Redirects     — followed MANUALLY. `redirect: "follow"` would let
 *                   a public URL bounce to an internal one with no
 *                   second check; `redirect: "error"` is too blunt for
 *                   the real web, where publishers redirect constantly.
 *   Content type  — allowlisted. A URL that answers with a 200 MB
 *                   video is not something to buffer into memory.
 *   Size          — capped while STREAMING, so an attacker cannot make
 *                   the server allocate gigabytes by lying in
 *                   Content-Length or omitting it.
 *   Time          — hard deadline across the whole redirect chain, not
 *                   per hop, so a slow-loris chain cannot hold a worker
 *                   open indefinitely.
 *
 * KNOWN RESIDUAL RISK: between assertSafeUrl()'s DNS resolution and
 * the socket connecting, a hostile DNS server could return a
 * different address (classic TOCTOU rebinding). Closing that fully
 * requires dialing the validated IP directly and carrying the Host
 * header, which undici does not expose portably here. The window is
 * small and every redirect is re-validated; it is recorded rather
 * than quietly ignored.
 * ================================================================== */

import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"
import { logger } from "@/lib/observability/logger"

export const MAX_REDIRECTS = 5
export const MAX_BYTES = 5 * 1024 * 1024 // 5 MB of HTML is already extraordinary
export const TOTAL_TIMEOUT_MS = 20_000

/** Identifies the fetcher honestly and points operators at what it is
 * doing. Pocket2 never disguises itself as a browser to get past a
 * check that is there to stop automated access. */
export const USER_AGENT = "Pocket2Bot/1.0 (+https://pocket2.io/bot; personal library link preview)"

const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]

export type FetchFailureReason =
  | "blocked_unsafe_url"
  | "too_many_redirects"
  | "unsupported_content_type"
  | "too_large"
  | "timeout"
  | "http_error"
  | "network_error"
  | "robots_disallowed"
  | "paywalled"
  | "login_required"

export interface FetchSuccess {
  ok: true
  /** the URL actually served, after redirects — this is what should be
   * treated as canonical if it differs from what the user submitted */
  finalUrl: string
  status: number
  contentType: string
  html: string
  /** true when the response asked not to be archived. Metadata is
   * still fine; storing a reader copy is not. */
  noArchive: boolean
  bytes: number
}

export interface FetchFailure {
  ok: false
  reason: FetchFailureReason
  /** safe to show a person; never contains internal addresses */
  message: string
  status?: number
}

export type FetchResult = FetchSuccess | FetchFailure

/** Publishers signal "you may link to this but do not keep a copy"
 * with X-Robots-Tag. Honouring it is the difference between a link
 * saver and a scraper. */
function hasNoArchive(headers: Headers): boolean {
  const tag = headers.get("x-robots-tag")?.toLowerCase() ?? ""
  return tag.includes("noarchive") || tag.includes("nosnippet") || tag.includes("noindex")
}

/** 401/403 mean the content is behind authentication. 402 and the
 * common "paywall" conventions mean it is behind payment. Neither is
 * an obstacle to route around — both are a real answer that the
 * product reports honestly. */
function classifyHttpStatus(status: number): FetchFailure | null {
  if (status === 401) return { ok: false, reason: "login_required", status, message: "This page requires you to sign in, so only the link was saved." }
  if (status === 402) return { ok: false, reason: "paywalled", status, message: "This publisher requires a subscription, so only the link was saved." }
  if (status === 403) return { ok: false, reason: "login_required", status, message: "The publisher declined an automated request, so only the link was saved." }
  if (status === 451) return { ok: false, reason: "robots_disallowed", status, message: "This page is not legally available to fetch, so only the link was saved." }
  if (status >= 400) return { ok: false, reason: "http_error", status, message: `The page returned ${status}, so only the link was saved.` }
  return null
}

/** Reads the body with a hard byte ceiling, enforced as chunks arrive.
 * Content-Length is a hint from a stranger, not a guarantee — it is
 * used as an early exit, never as the only check. */
async function readCapped(response: Response, limit: number): Promise<{ text: string; bytes: number } | null> {
  const declared = Number(response.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > limit) return null

  const body = response.body
  if (!body) return { text: "", bytes: 0 }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      if (bytes > limit) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  // Respect the charset the server declared, falling back to UTF-8.
  // Getting this wrong turns a French article into mojibake.
  const charset = /charset=([\w-]+)/i.exec(response.headers.get("content-type") ?? "")?.[1] ?? "utf-8"
  let text: string
  try {
    text = new TextDecoder(charset).decode(merged)
  } catch {
    text = new TextDecoder("utf-8").decode(merged)
  }
  return { text, bytes }
}

/**
 * Fetch a page for ingestion.
 *
 * Never throws for an expected condition — a blocked URL, a paywall, a
 * 404 and a timeout are all normal outcomes of pointing at the open
 * web, and each returns a typed failure the pipeline records honestly.
 */
export async function fetchForIngest(rawUrl: string, requestId?: string): Promise<FetchResult> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  let current = rawUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      return { ok: false, reason: "timeout", message: "The page took too long to respond, so only the link was saved." }
    }

    let safeUrl: URL
    try {
      // Re-validated on EVERY hop. This is the check a naive
      // `redirect: "follow"` skips.
      safeUrl = await assertSafeUrl(current)
    } catch (error) {
      if (error instanceof UnsafeUrlError) {
        logger.warn("pocket2_ingest_blocked_url", { requestId, hop, reason: error.message })
        return { ok: false, reason: "blocked_unsafe_url", message: "That address can't be fetched safely." }
      }
      throw error
    }

    let response: Response
    try {
      response = await fetch(safeUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(remaining),
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
          "user-agent": USER_AGENT,
          "accept-language": "en",
        },
      })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      return timedOut
        ? { ok: false, reason: "timeout", message: "The page took too long to respond, so only the link was saved." }
        : { ok: false, reason: "network_error", message: "That page couldn't be reached, so only the link was saved." }
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) {
        return { ok: false, reason: "http_error", status: response.status, message: "The page redirected without saying where." }
      }
      // Relative Location headers are legal and common.
      current = new URL(location, safeUrl).toString()
      continue
    }

    const httpFailure = classifyHttpStatus(response.status)
    if (httpFailure) return httpFailure

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase()
    if (!ALLOWED_CONTENT_TYPES.some((allowed) => contentType.includes(allowed))) {
      return {
        ok: false,
        reason: "unsupported_content_type",
        message: "That link isn't a readable page, so only the link was saved.",
      }
    }

    const body = await readCapped(response, MAX_BYTES)
    if (!body) {
      return { ok: false, reason: "too_large", message: "That page is too large to process, so only the link was saved." }
    }

    return {
      ok: true,
      finalUrl: safeUrl.toString(),
      status: response.status,
      contentType,
      html: body.text,
      noArchive: hasNoArchive(response.headers),
      bytes: body.bytes,
    }
  }

  return { ok: false, reason: "too_many_redirects", message: "That link redirected too many times, so only the link was saved." }
}

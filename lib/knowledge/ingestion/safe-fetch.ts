import "server-only"

/* ================================================================== *
 * SAFE FETCH — the untrusted-input security boundary.
 *
 * Users submit arbitrary internet URLs, so this is the single most
 * security-sensitive module in the Knowledge Library.
 *
 * The shared guard (assertSafeUrl, lib/security/ssrf-guard.ts) already
 * validates scheme, blocked hostnames, IP literals, and every address
 * a hostname resolves to. This module closes the four gaps the Phase 5
 * audit identified around it:
 *
 *   1. TOCTOU — the guard resolves DNS, then the fetch resolves AGAIN.
 *      A hostile resolver can answer public, then private. Fixed by
 *      PINNING: we resolve once, validate the address, and force the
 *      socket to connect to that exact address via the `lookup` hook,
 *      sending the original Host header. DNS is never consulted twice.
 *
 *   2. Redirects — validated per hop, not once. `redirect: "error"`
 *      would be safe but breaks shorteners and CDNs, which matters for
 *      a save-anything product.
 *
 *   3. Response size — streamed with a hard cap and aborted on breach.
 *
 *   4. Content type — allowlisted.
 *
 * Address range checks are NOT reimplemented here. Each resolved
 * address is validated by handing it back to the shared guard as an
 * IP-literal URL, so there is exactly one implementation of "is this
 * address private" in the repository.
 *
 * Internal response content is never surfaced to the user: callers get
 * a typed failure code and a plain-language message, never a body or a
 * header from a blocked host.
 * ================================================================== */

import { lookup as dnsLookup } from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import { assertSafeUrl, UnsafeUrlError } from "@/lib/platform/security"

export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_REDIRECTS = 5
export const CONNECT_TIMEOUT_MS = 10_000
export const TOTAL_TIMEOUT_MS = 30_000

const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"]

export type FetchFailureCode =
  | "invalid_url"
  | "blocked_by_ssrf_guard"
  | "dns_failure"
  | "timeout"
  | "too_many_redirects"
  | "too_large"
  | "unsupported_content_type"
  | "http_4xx"
  | "http_5xx"
  | "network_error"

export class SafeFetchError extends Error {
  readonly code: FetchFailureCode
  /** Safe to show a user. Never contains response content. */
  readonly userMessage: string

  // NOTE: explicit fields rather than TypeScript parameter properties.
  // Parameter properties are not supported by Node's strip-only type
  // stripping, which is what runs the test suite (zero new deps).
  constructor(code: FetchFailureCode, userMessage: string, message?: string) {
    super(message ?? userMessage)
    this.name = "SafeFetchError"
    this.code = code
    this.userMessage = userMessage
  }
}

export interface SafeFetchResult {
  /** The URL actually fetched, after redirects. */
  resolvedUrl: string
  /** Set only when a redirect actually changed the URL. */
  originUrl: string | null
  status: number
  contentType: string
  /** The document decoded to a JS string, for extraction. */
  html: string
  bytes: number
  /**
   * THE BYTES EXACTLY AS SERVED, undecoded.
   *
   * `html` above is already a transformation — a decode from whatever
   * the publisher declared into UTF-16 — and M2's one hard requirement
   * is that the ORIGINAL representation survives. So the archive
   * stores this, not `html`: a mis-detected charset then costs us a
   * re-extraction rather than the document.
   */
  body: Buffer
  /** The charset we decoded with, as declared by the publisher. */
  charset: string
}

/** Wrap a bare address so the shared guard sees it as an IP literal. */
function addressAsUrl(address: string, protocol: string): string {
  const host = address.includes(":") ? `[${address}]` : address
  return `${protocol}//${host}/`
}

/**
 * Resolve a hostname and return the first address that the shared
 * guard accepts. Reuses assertSafeUrl for the range check so the
 * private-range logic exists in exactly one place.
 */
async function resolvePinnedAddress(url: URL): Promise<{ address: string; family: number }> {
  let addresses: { address: string; family: number }[]
  try {
    addresses = await dnsLookup(url.hostname, { all: true })
  } catch {
    throw new SafeFetchError("dns_failure", "We couldn't find that site.")
  }
  if (addresses.length === 0) {
    throw new SafeFetchError("dns_failure", "We couldn't find that site.")
  }

  for (const candidate of addresses) {
    try {
      await assertSafeUrl(addressAsUrl(candidate.address, url.protocol))
      return candidate
    } catch {
      /* private/blocked — try the next address */
    }
  }
  throw new SafeFetchError(
    "blocked_by_ssrf_guard",
    "That address is on a private network, so we can't reach it.",
  )
}

interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

/** One hop. DNS is pinned to `address`; the Host header stays the real hostname. */
function requestOnce(url: URL, address: string, family: number, deadline: number): Promise<RawResponse> {
  const transport = url.protocol === "https:" ? https : http

  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      reject(new SafeFetchError("timeout", "That site took too long to respond."))
      return
    }

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname, // drives SNI and the Host header
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        timeout: Math.min(CONNECT_TIMEOUT_MS, remaining),
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "accept-language": "en",
          "user-agent": "WhitehabbitKnowledgeBot/1.0 (+https://whitehabbit.example/bot)",
        },
        // THE PIN: the socket connects to the address we already
        // validated. DNS is never consulted a second time, which is
        // what closes the TOCTOU window.
        lookup: (_hostname, _options, callback) => {
          callback(null, address, family)
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let total = 0

        // Reject an oversized body from the header when it is honest,
        // and enforce the cap again while streaming when it is not.
        const declared = Number(res.headers["content-length"] ?? 0)
        if (declared > MAX_RESPONSE_BYTES) {
          res.destroy()
          reject(new SafeFetchError("too_large", "That page is too large to save."))
          return
        }

        res.on("data", (chunk: Buffer) => {
          total += chunk.length
          if (total > MAX_RESPONSE_BYTES) {
            res.destroy()
            reject(new SafeFetchError("too_large", "That page is too large to save."))
            return
          }
          chunks.push(chunk)
        })
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
        })
        res.on("error", () => {
          reject(new SafeFetchError("network_error", "We couldn't read that page."))
        })
      },
    )

    req.on("timeout", () => {
      req.destroy()
      reject(new SafeFetchError("timeout", "That site took too long to respond."))
    })
    req.on("error", () => {
      reject(new SafeFetchError("network_error", "We couldn't reach that site."))
    })
    req.end()
  })
}

/**
 * Fetch a user-submitted URL safely.
 *
 * Every hop is independently validated: the shared guard first (scheme,
 * blocked hosts, resolved ranges), then an explicit address pin. A
 * redirect to a private address on hop 3 is blocked exactly as one on
 * hop 1 would be.
 */
export async function safeFetch(rawUrl: string): Promise<SafeFetchResult> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  const startUrl = rawUrl
  let current = rawUrl
  let redirects = 0

  for (;;) {
    let url: URL
    try {
      url = await assertSafeUrl(current)
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        throw new SafeFetchError("blocked_by_ssrf_guard", "That address isn't reachable from the public internet.")
      }
      throw new SafeFetchError("invalid_url", "That doesn't look like a valid URL.")
    }

    const pinned = await resolvePinnedAddress(url)
    const res = await requestOnce(url, pinned.address, pinned.family, deadline)

    // ---- redirects: revalidate the target as a fresh, untrusted URL
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      redirects += 1
      if (redirects > MAX_REDIRECTS) {
        throw new SafeFetchError("too_many_redirects", "That link redirected too many times.")
      }
      let next: string
      try {
        next = new URL(res.headers.location, url).toString()
      } catch {
        throw new SafeFetchError("invalid_url", "That link redirected somewhere invalid.")
      }
      current = next
      continue
    }

    if (res.status >= 500) {
      throw new SafeFetchError("http_5xx", "That site returned an error. It may be temporary.")
    }
    if (res.status >= 400) {
      throw new SafeFetchError("http_4xx", `That page couldn't be loaded (${res.status}).`)
    }

    const rawContentType = String(res.headers["content-type"] ?? "")
    const contentType = rawContentType.split(";")[0].trim().toLowerCase()
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new SafeFetchError(
        "unsupported_content_type",
        contentType ? `We can only save web pages (that link is ${contentType}).` : "We can only save web pages.",
      )
    }

    const charsetMatch = /charset=([^;]+)/i.exec(rawContentType)
    const charset = (charsetMatch?.[1] ?? "utf-8").trim().toLowerCase()
    const encoding: BufferEncoding = charset === "iso-8859-1" || charset === "latin1" ? "latin1" : "utf8"

    const finalUrl = url.toString()
    return {
      resolvedUrl: finalUrl,
      originUrl: finalUrl === startUrl ? null : startUrl,
      status: res.status,
      contentType,
      html: res.body.toString(encoding),
      bytes: res.body.length,
      body: res.body,
      charset,
    }
  }
}

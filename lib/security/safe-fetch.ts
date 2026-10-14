import "server-only"

/* ================================================================== *
 * SAFE FETCH — the untrusted-URL network boundary.
 *
 * Users hand this application arbitrary URLs, so this is the most
 * security-sensitive code path in the product. assertSafeUrl
 * (lib/security/ssrf-guard.ts) already validates scheme, blocked
 * hostnames, IP literals and every address a hostname resolves to.
 * This module closes the two gaps AROUND that guard.
 *
 * ---- C-1 · REDIRECTS -----------------------------------------------
 *
 * `fetch(url, { redirect: "follow" })` validates nothing after the
 * first URL. A public page answering 302 -> http://169.254.169.254/
 * is fetched with no check at all, and its body is returned to the
 * caller. Here every hop is a fresh, untrusted URL: the guard runs
 * again, in full, before each connection. A redirect to a private
 * address on hop 4 is refused exactly as one on hop 1 is.
 *
 * `redirect: "error"` would also be safe and is what the Workforce
 * browser tool does — but shorteners and CDNs are ordinary on a
 * save-anything product, so refusing all redirects would break real
 * pages. Following them under revalidation is the harder, correct
 * option.
 *
 * ---- C-3 · DNS REBINDING (TOCTOU) ----------------------------------
 *
 * The gap is not that DNS is unchecked; it is that it is checked
 * TWICE. The guard resolves a hostname and validates the answer, then
 * fetch() resolves the same hostname INDEPENDENTLY and connects to
 * whatever it gets. A resolver under an attacker's control answers
 * public for the first query and private for the second, and the
 * validation is bypassed without ever being wrong.
 *
 * Resolving one more time before connecting does not fix this. It
 * just moves the window. The only fix is to make the validated
 * address and the connected address THE SAME OBJECT:
 *
 *   1. resolve the hostname exactly once;
 *   2. validate every address it returned, through the shared guard;
 *   3. connect by handing node:http a `lookup` hook that returns that
 *      address and never consults DNS again.
 *
 * The Host header and TLS SNI still carry the original hostname, so
 * virtual hosting and certificate validation work normally. This is
 * why the module uses node:http/node:https rather than fetch(): fetch
 * offers no way to pin the address it connects to. Route handlers run
 * on the Node.js runtime, where these are available; a caller on the
 * Edge runtime would not be able to use this module, which is a
 * deliberate constraint rather than an oversight.
 *
 * ---- WHAT IS RETURNED TO A CALLER ----------------------------------
 *
 * A typed failure code and a message safe to show a stranger. Response
 * bodies, resolved addresses, DNS errors and redirect targets never
 * appear in a user-facing message: on a public endpoint those turn the
 * fetcher into an oracle for mapping an internal network. The detail
 * is preserved on `.detail` for server-side logging only.
 * ================================================================== */

import http from "node:http"
import https from "node:https"
import {
  MAX_RESOLVED_ADDRESSES,
  resolveSafeUrl,
  UnsafeUrlError,
  type AddressResolver,
  type ResolvedAddress,
  type SafeUrl,
} from "./ssrf-guard"

/** Deliberately small. A legitimate shortener chain is one or two
 * hops; a long chain is either a loop or someone probing. */
export const MAX_REDIRECTS = 5

/** How many addresses of a single hostname are considered.
 *  Re-exported from the guard, which enforces it, so there is one
 *  definition rather than two that can drift. */
export const MAX_ADDRESSES = MAX_RESOLVED_ADDRESSES

export type SafeFetchFailureCode =
  | "invalid_url"
  | "blocked"
  | "timeout"
  | "too_many_redirects"
  | "too_large"
  | "http_error"
  | "network_error"

/**
 * A failure with two audiences.
 *
 * `userMessage` is safe to return from a public endpoint. `detail` is
 * for the server log and must never be sent to a caller — telling a
 * stranger that a host "resolves to a private address" confirms the
 * host exists, and repeating that over a wordlist maps the network.
 */
export class SafeFetchError extends Error {
  readonly code: SafeFetchFailureCode
  readonly userMessage: string
  readonly detail: string

  constructor(code: SafeFetchFailureCode, userMessage: string, detail?: string) {
    super(userMessage)
    this.name = "SafeFetchError"
    this.code = code
    this.userMessage = userMessage
    this.detail = detail ?? userMessage
  }
}

/** Re-exported so existing callers and tests keep one import site.
 *  Both are defined by the guard, which is what validates them. */
export type { AddressResolver, ResolvedAddress }

export interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

export interface TransportRequest {
  url: URL
  /** The validated address. The transport MUST connect to this and
   * must not resolve the hostname itself. */
  address: string
  family: number
  timeoutMs: number
  maxBytes: number
  headers: Record<string, string>
}

/** The single hop. Injectable so redirect chains can be tested without
 * a network; the guard runs outside it, on every hop, either way. */
export type Transport = (request: TransportRequest) => Promise<RawResponse>

export interface SafeFetchOptions {
  timeoutMs: number
  maxBytes: number
  headers?: Record<string, string>
  maxRedirects?: number
  /** Test seam. */
  resolver?: AddressResolver
  /** Test seam. */
  transport?: Transport
}

export interface SafeFetchResult {
  /** The URL actually fetched, after every redirect. */
  finalUrl: string
  /** The URL originally requested, when a redirect changed it. */
  originUrl: string | null
  status: number
  /** Lower-cased, parameters stripped ("text/html"). */
  contentType: string
  /** Raw bytes. Decoding is the caller's decision. */
  body: Buffer
  redirects: number
}

/* defaultResolver, addressAsUrl and resolveAndPin used to live here.
 * They are gone because the guard now RETURNS the addresses it
 * validated (resolveSafeUrl), so this module no longer performs a
 * second resolution of its own in order to pin a socket. One lookup
 * per hop, validated, and that same answer is what the socket uses.
 */

/**
 * One hop over a socket pinned to `address`.
 *
 * Exported so the pin can be tested directly against a real server:
 * that is the only way to prove the `lookup` hook genuinely overrides
 * resolution rather than merely being passed.
 *
 * `hostname` still drives the Host header and TLS SNI; only the
 * address lookup is overridden. That is the whole trick: the name is
 * used for everything a name is for, and the address is the one we
 * already validated.
 */
export const nodeTransport: Transport = (request) =>
  new Promise((resolve, reject) => {
    const { url, address, family, timeoutMs, maxBytes, headers } = request
    const transport = url.protocol === "https:" ? https : http

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        timeout: timeoutMs,
        headers,
        // THE PIN. DNS is never consulted a second time.
        //
        // Node calls this with `{ all: true }`, and in that mode the
        // callback takes an ARRAY. Answering with the three-argument
        // form instead fails with ERR_INVALID_IP_ADDRESS — the socket
        // never connects, so the pin silently does not pin. Both
        // shapes are handled because the option is Node's to choose,
        // and tests/security/safe-fetch.test.ts exercises this against
        // a real server for exactly that reason.
        lookup: (_hostname, lookupOptions, callback) => {
          const done = callback as unknown as (
            err: NodeJS.ErrnoException | null,
            addressOrList: string | ResolvedAddress[],
            family?: number,
          ) => void
          if ((lookupOptions as { all?: boolean })?.all) done(null, [{ address, family }])
          else done(null, address, family)
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let total = 0

        // Refuse an oversized body from its declared length when that
        // is honest, and enforce the cap again while streaming when it
        // is not.
        const declared = Number(res.headers["content-length"] ?? 0)
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy()
          reject(new SafeFetchError("too_large", "That page is too large to read.", `content-length ${declared}`))
          return
        }

        res.on("data", (chunk: Buffer) => {
          total += chunk.length
          if (total > maxBytes) {
            res.destroy()
            reject(new SafeFetchError("too_large", "That page is too large to read.", `streamed past ${maxBytes}`))
            return
          }
          chunks.push(chunk)
        })
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
        })
        res.on("error", (err) => {
          reject(new SafeFetchError("network_error", "We couldn't read that page.", err.message))
        })
      },
    )

    req.on("timeout", () => {
      req.destroy()
      reject(new SafeFetchError("timeout", "That site took too long to respond.", `timeout after ${timeoutMs}ms`))
    })
    req.on("error", (err) => {
      reject(new SafeFetchError("network_error", "We couldn't reach that site.", err.message))
    })
    req.end()
  })

/** Resolve a Location header against the URL that produced it. */
export function resolveRedirectTarget(location: string, from: URL): string {
  try {
    return new URL(location, from).toString()
  } catch {
    throw new SafeFetchError("invalid_url", "That link redirected somewhere invalid.", `bad Location: ${location}`)
  }
}

/**
 * Fetch a user-supplied URL, revalidating every hop and pinning every
 * connection to an address the shared guard has approved.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const transport = options.transport ?? nodeTransport
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  const deadline = Date.now() + options.timeoutMs

  const startUrl = rawUrl
  let current = rawUrl
  let redirects = 0

  for (;;) {
    // ---- gate 1: the shared guard, on this hop's URL, in full.
    // Scheme, blocked hostnames, IP literals and resolved ranges. Not
    // reimplemented here — there is one definition of "unsafe address"
    // in this repository and it lives in ssrf-guard.ts.
    let safe: SafeUrl
    try {
      // ONE resolution for this hop. The guard validates the scheme,
      // blocked names, IP literals and every address the hostname
      // answered with, and returns those addresses so the socket below
      // connects to an answer that was actually checked.
      safe = await resolveSafeUrl(current, { resolver: options.resolver })
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        // The DNS failure itself is kept for the log via `cause`; the
        // message the caller sees stays generic either way.
        const because = err.cause instanceof Error ? `: ${err.cause.message}` : ""
        throw new SafeFetchError("blocked", "We couldn't reach that address.", `${err.message}${because}`)
      }
      throw new SafeFetchError("invalid_url", "That doesn't look like a valid URL.", String(err))
    }
    const url = safe.url
    const pinned = safe.addresses[0]

    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new SafeFetchError("timeout", "That site took too long to respond.", "deadline exceeded before request")
    }

    const res = await transport({
      url,
      address: pinned.address,
      family: pinned.family,
      timeoutMs: remaining,
      maxBytes: options.maxBytes,
      headers: options.headers ?? {},
    })

    // ---- redirects: the target is a brand-new untrusted URL.
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      redirects += 1
      if (redirects > maxRedirects) {
        throw new SafeFetchError(
          "too_many_redirects",
          "That link redirected too many times.",
          `over ${maxRedirects} hops from ${startUrl}`,
        )
      }
      // Relative Locations are resolved against the URL that issued
      // them, then go around the loop and face both gates again.
      current = resolveRedirectTarget(String(res.headers.location), url)
      continue
    }

    if (res.status >= 400) {
      throw new SafeFetchError(
        "http_error",
        `That page couldn't be loaded (${res.status}).`,
        `status ${res.status} from ${url.hostname}`,
      )
    }

    const rawContentType = String(res.headers["content-type"] ?? "")
    const finalUrl = url.toString()
    return {
      finalUrl,
      originUrl: finalUrl === startUrl ? null : startUrl,
      status: res.status,
      contentType: rawContentType.split(";")[0].trim().toLowerCase(),
      body: res.body,
      redirects,
    }
  }
}

import "server-only"

/* ================================================================== *
 * SAFE FETCH — the crawler's one fetch primitive. Every hop (including
 * every redirect hop) is validated by lib/security/ssrf-guard.ts's
 * assertSafeUrl() BEFORE it is requested — a redirect to a private
 * address is refused exactly like a direct request to one would be.
 * DNS is re-resolved (inside assertSafeUrl) on every hop too, not just
 * the first — defeats a rebind that only flips after the first request.
 *
 * lib/agent/tools/browser.ts's openPage() deliberately uses
 * `redirect: "error"` (a single-page tool, redirects just fail it).
 * The crawler needs to actually follow redirects (§2's requirement) so
 * this is a separate helper, not a browser.ts change — same
 * underlying guard, different policy on top of it.
 * ================================================================== */

import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"

export interface SafeFetchResult {
  ok: boolean
  finalUrl: string
  status: number
  contentType: string | null
  body: string
  /** every URL actually requested, in order, including the final one */
  hops: string[]
  error?: string
}

export type SafeFetchFn = (url: string, opts?: { timeoutMs?: number; maxBytes?: number; accept?: string }) => Promise<SafeFetchResult>

const MAX_REDIRECTS = 5

/** Fetches `url`, following up to MAX_REDIRECTS redirects, re-validating
 * every single hop with assertSafeUrl() — never trusts a Location
 * header without re-checking it. Bounded by `maxBytes` (reads the body
 * in a stream and aborts once the limit is exceeded, rather than
 * buffering an arbitrarily large response) and `timeoutMs`. */
export async function safeFetch(url: string, opts: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000
  const maxBytes = opts.maxBytes ?? 2_000_000
  const hops: string[] = []
  let current = url

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let safeUrl: URL
    try {
      safeUrl = await assertSafeUrl(current)
    } catch (err) {
      return { ok: false, finalUrl: current, status: 0, contentType: null, body: "", hops, error: err instanceof UnsafeUrlError ? err.message : String(err) }
    }
    hops.push(safeUrl.toString())

    let res: Response
    try {
      res = await fetch(safeUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9" },
        redirect: "manual",
      })
    } catch (err) {
      return { ok: false, finalUrl: safeUrl.toString(), status: 0, contentType: null, body: "", hops, error: err instanceof Error ? err.message : "Fetch failed" }
    }

    // manual redirect: a 3xx response body is empty and Location holds
    // the next hop — resolve it relative to the URL we just requested,
    // then loop back to the top so it gets its OWN assertSafeUrl() check.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location")
      if (!location) {
        return { ok: false, finalUrl: safeUrl.toString(), status: res.status, contentType: null, body: "", hops, error: `Redirect (${res.status}) with no Location header.` }
      }
      if (i === MAX_REDIRECTS) {
        return { ok: false, finalUrl: safeUrl.toString(), status: res.status, contentType: null, body: "", hops, error: "Too many redirects." }
      }
      current = new URL(location, safeUrl).toString()
      continue
    }

    const contentType = res.headers.get("content-type")
    const body = await readBounded(res, maxBytes)
    return { ok: res.ok, finalUrl: safeUrl.toString(), status: res.status, contentType, body, hops }
  }

  return { ok: false, finalUrl: current, status: 0, contentType: null, body: "", hops, error: "Too many redirects." }
}

async function readBounded(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)))
        break
      }
      chunks.push(value)
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8")
}

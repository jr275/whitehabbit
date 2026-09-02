/* ================================================================== *
 * URL CANONICALIZATION — isomorphic (no server-only): shared verbatim
 * by the authenticated pipeline (lib/knowledge/service.ts) and the
 * guest store (lib/knowledge/guest-store.ts) so duplicate detection
 * behaves identically on both. It produces a STABLE dedup key, not a
 * display value — the exact URL the user submitted is always stored
 * and shown separately; this key only decides "is this the same thing
 * I already saved?".
 *
 * It normalizes the ways the same content commonly arrives as slightly
 * different strings:
 *   - missing scheme            → https://
 *   - host case + leading www.  → lowercased, www. dropped
 *   - a #fragment               → removed (same document)
 *   - a trailing slash on a path→ removed (/article/ === /article)
 *   - tracking/analytics params → removed (utm_*, gclid, fbclid, …)
 *   - remaining query params    → sorted (order is not identity)
 * It never removes meaningful params (?v=, ?id=, ?p=…) — only known
 * tracking noise — so genuinely different pages stay distinct.
 * ================================================================== */

/** Exact param names that only ever carry tracking/analytics data. */
const TRACKING_PARAMS = new Set([
  "gclid",
  "dclid",
  "fbclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "vero_id",
  "vero_conv",
  "oly_anon_id",
  "oly_enc_id",
  "_hsenc",
  "_hsmi",
  "hsctatracking",
  "ref_src",
  "ref_url",
  "spm",
])

/** Prefix families that are always tracking (utm_*, _ga*, pk_*, etc). */
const TRACKING_PREFIXES = [/^utm_/i, /^_ga/i, /^pk_/i, /^piwik_/i, /^ga_/i]

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase()
  if (TRACKING_PARAMS.has(k)) return true
  return TRACKING_PREFIXES.some((re) => re.test(k))
}

/**
 * Turn a user-submitted URL string into a canonical dedup key. Throws
 * if the input can't be parsed as an http(s) URL — callers already
 * validate/normalize for storage, so in practice this succeeds; the
 * throw is a safety net, never a user-facing path.
 */
export function canonicalizeUrl(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withScheme)

  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "")
  url.hash = ""

  // Drop tracking params, keep the rest, then sort for a stable key.
  const kept: [string, string][] = []
  for (const [key, value] of url.searchParams) {
    if (!isTrackingParam(key)) kept.push([key, value])
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  const search = new URLSearchParams(kept).toString()
  url.search = search

  // Collapse a trailing slash on a real path ("/a/" === "/a"); leave
  // the root ("/") untouched.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "")
  }

  return url.toString()
}

/** Non-throwing variant — returns null when the input can't be parsed,
 *  so a callsite that already has a validated URL can stay branch-free. */
export function canonicalizeUrlSafe(input: string): string | null {
  try {
    return canonicalizeUrl(input)
  } catch {
    return null
  }
}

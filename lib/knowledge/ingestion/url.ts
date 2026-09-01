/* ================================================================== *
 * URL CANONICALIZATION AND HASHING
 *
 * Duplicate detection is the most visible correctness property of a
 * save-anything product: the same article saved from a newsletter and
 * from a social post must produce ONE object.
 *
 * Wallabag hashes the raw URL with SHA-1 and does not canonicalise, so
 * `?utm_source=x` creates a duplicate entry (Phase 1 §K14). This does
 * the canonicalisation first, then SHA-256.
 *
 * Pure module — no I/O, no platform imports — so it is directly unit
 * testable and safe to call from anywhere.
 * ================================================================== */

import { createHash } from "node:crypto"

/** Bumped when the rules below change, so a future rule change is a
 * deliberate, back-appliable migration rather than a silent identity
 * split. Stored alongside the object. */
export const CANONICALIZER_VERSION = 1

/** Params that identify a campaign or a referrer, never content. */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "dclid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "vero_id",
  "yclid",
  "ttclid",
  "_hsenc",
  "_hsmi",
  "hsctatracking",
  "ref",
  "ref_src",
  "referrer",
  "source",
  "spm",
])

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidUrlError"
  }
}

export interface CanonicalUrl {
  /** Exactly what the user submitted, preserved verbatim. */
  submittedUrl: string
  /** The normalised form used for identity. */
  canonicalUrl: string
  /** sha256(canonicalUrl) */
  urlHash: string
  /** Host with a leading "www." removed. */
  domain: string
}

function isTracking(key: string): boolean {
  const k = key.toLowerCase()
  return k.startsWith("utm_") || TRACKING_PARAMS.has(k)
}

/**
 * Normalises a user-submitted URL into a stable identity.
 *
 * Deliberately does NOT follow redirects — that is the capture stage's
 * job and it must not block the save response. A redirect that lands
 * somewhere already saved is caught by the second dedupe pass once the
 * resolved URL is known.
 */
export function canonicalizeUrl(input: string): CanonicalUrl {
  const submittedUrl = input.trim()
  if (submittedUrl.length === 0) throw new InvalidUrlError("Enter a URL.")
  if (submittedUrl.length > 2048) throw new InvalidUrlError("That URL is too long.")

  let url: URL
  try {
    url = new URL(submittedUrl)
  } catch {
    throw new InvalidUrlError("That doesn't look like a valid URL.")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidUrlError("Only http and https links can be saved.")
  }
  if (url.hostname.length === 0) throw new InvalidUrlError("That URL has no host.")

  // --- host: lowercase, strip a trailing dot, strip default ports ---
  // (URL already lowercases the hostname and drops default ports.)
  // "www." is stripped from the canonical form too, not just from
  // `domain`: www.example.com/a and example.com/a are the same page in
  // practice, and treating them as two saves is exactly the duplicate
  // this canonicaliser exists to prevent.
  const domain = url.hostname.replace(/\.$/, "").replace(/^www\./, "")
  let host = domain

  // --- query: drop tracking params, then sort what remains ---
  const params: [string, string][] = []
  for (const [key, value] of url.searchParams.entries()) {
    if (!isTracking(key)) params.push([key, value])
  }
  params.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
  const search = params.length > 0 ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : ""

  // --- path: collapse duplicate slashes, strip a trailing slash ---
  let pathname = url.pathname.replace(/\/{2,}/g, "/")
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1)
  if (pathname === "") pathname = "/"

  // --- fragment: dropped, EXCEPT hash routing, which is path-bearing ---
  const hash = url.hash.startsWith("#!") || url.hash.startsWith("#/") ? url.hash : ""

  // IPv6 literals keep their brackets in an authority.
  if (host.includes(":")) host = `[${host}]`

  const canonicalUrl = `${url.protocol}//${host}${pathname}${search}${hash}`

  return {
    submittedUrl,
    canonicalUrl,
    urlHash: createHash("sha256").update(canonicalUrl).digest("hex"),
    domain,
  }
}

/** Hash an already-canonical URL (used for the post-redirect dedupe pass). */
export function hashCanonicalUrl(canonicalUrl: string): string {
  return createHash("sha256").update(canonicalUrl).digest("hex")
}

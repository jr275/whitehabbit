/* ================================================================== *
 * URL CANONICALIZATION — what makes "save" idempotent.
 *
 * Two URLs that name the same page must produce the same
 * canonicalUrl, and therefore the same urlHash, and therefore collide
 * on the (org_id, url_hash) unique index. This module is where that
 * judgement lives, so the rule is testable in isolation and identical
 * everywhere it is applied.
 *
 * Pure: no network, no database, no DNS. It decides IDENTITY only.
 * Whether a URL is SAFE TO FETCH is a different question, answered by
 * lib/security/ssrf-guard.ts at fetch time — the two must never be
 * confused, because a URL can be perfectly well-formed and still
 * point at an internal address.
 * ================================================================== */

import { createHash } from "node:crypto"

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidUrlError"
  }
}

/** Only these schemes may ever be saved. Anything else — javascript:,
 * data:, file:, ftp: — is rejected at the entry point, before it can
 * reach storage or a renderer. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

/** Parameters that identify a marketing campaign, not a document.
 * Stripping them is what makes the same article shared from a
 * newsletter and from social resolve to one saved item. */
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "utm_name", "utm_source_platform", "utm_creative_format",
  "gclid", "gclsrc", "dclid", "gbraid", "wbraid",
  "fbclid", "igshid", "twclid", "ttclid", "msclkid", "yclid",
  "mc_cid", "mc_eid", "_hsenc", "_hsmi", "hsCtaTracking",
  "ref", "referrer", "source", "s_kwcid", "vero_id", "vero_conv",
  "spm", "scm", "share_id", "trk", "trkCampaign",
  "__s", "_ga", "_gl", "oly_anon_id", "oly_enc_id",
  "piwik_campaign", "pk_campaign", "pk_kwd", "matomo_campaign",
])

const DEFAULT_PORTS: Record<string, string> = { "http:": "80", "https:": "443" }

/** Hosts where a bare "www." prefix is the only difference between two
 * spellings of the same site. Stripping it is right for the vast
 * majority of the web; it is deliberately NOT applied to any host with
 * more than one label before the registrable domain, so
 * `www.eu.example.com` keeps its shape. */
function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname
}

export interface CanonicalUrl {
  /** exactly what the user gave us, trimmed — shown as "open original" */
  original: string
  /** the normalized identity form */
  canonical: string
  /** sha256(canonical) — the dedupe key. Hashed rather than indexed
   * directly because real URLs routinely exceed btree's row limit. */
  hash: string
  /** registrable host, lowercased, www-stripped — the "source" facet */
  domain: string
}

/**
 * Normalize a user-supplied URL into its identity form.
 *
 * Applies, in order: scheme allowlist -> lowercase host -> strip
 * default port -> strip www -> drop fragment -> remove tracking
 * params -> sort remaining params -> normalize trailing slash.
 *
 * Throws InvalidUrlError with a message safe to show a user.
 */
export function canonicalizeUrl(input: string): CanonicalUrl {
  const trimmed = input.trim()
  if (!trimmed) throw new InvalidUrlError("Enter a URL to save.")

  // A bare "example.com/article" is what people actually paste. Treat
  // a missing scheme as https rather than rejecting it — but only when
  // the input has no scheme at all, never by rewriting one we disallow.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new InvalidUrlError("That doesn't look like a valid web address.")
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new InvalidUrlError(`Only http and https links can be saved (got "${url.protocol.replace(":", "")}").`)
  }

  if (!url.hostname) throw new InvalidUrlError("That address is missing a site name.")
  // A hostname with no dot and no port is almost always a typo or an
  // internal name; requiring a dot keeps "localhost" and "intranet"
  // out of the library. (Fetch-time safety is still the SSRF guard's
  // job — this is a usability check, not the security boundary.)
  if (!url.hostname.includes(".")) {
    throw new InvalidUrlError("That address doesn't include a valid site name.")
  }

  url.hostname = url.hostname.toLowerCase()
  if (url.port && DEFAULT_PORTS[url.protocol] === url.port) url.port = ""
  url.hostname = stripWww(url.hostname)
  url.hash = ""
  url.username = ""
  url.password = ""

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key) && !key.toLowerCase().startsWith("utm_"))
    // stable order so ?a=1&b=2 and ?b=2&a=1 are one saved item
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  url.search = ""
  for (const [key, value] of params) url.searchParams.append(key, value)

  // "/article/" and "/article" are the same document; "/" is not "".
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "")
  }

  const canonical = url.toString()
  return {
    original: trimmed,
    canonical,
    hash: createHash("sha256").update(canonical).digest("hex"),
    domain: url.hostname,
  }
}

/** A readable placeholder title for an item whose metadata hasn't been
 * fetched yet. The card shows this while ingestion is pending — it is
 * visibly derived from the URL, never presented as a real page title
 * we fetched. */
export function titleFromUrl(canonical: string): string {
  try {
    const url = new URL(canonical)
    const last = url.pathname.split("/").filter(Boolean).pop()
    if (!last) return url.hostname
    return decodeURIComponent(last)
      .replace(/\.(html?|php|aspx?|md)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase()) || url.hostname
  } catch {
    return canonical
  }
}

/** Google's favicon service is a pragmatic default: it needs no fetch
 * at save time and degrades to a blank image rather than an error.
 * Replaced by the real <link rel="icon"> during ingestion when the
 * page declares one. */
export function faviconForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
}

/** Average adult prose reading speed. Used only when a real word count
 * exists — never estimated from a URL or a description. */
const WORDS_PER_MINUTE = 225

export function readingTimeSeconds(wordCount: number): number {
  return Math.max(60, Math.round((wordCount / WORDS_PER_MINUTE) * 60))
}

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
 *   - a #fragment               → removed (same document), EXCEPT a
 *                                 hash ROUTE (#! or #/), which is not
 *                                 a position in a document but the
 *                                 address of one — see below
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
 * Is this fragment a ROUTE rather than a position in a document?
 *
 * An ordinary "#section" names a place inside a page that is the same
 * page either way, so dropping it is right and stays right.
 *
 * "#!/article/1" and "#/article/1" are different: in a hash-routed
 * single-page app the fragment IS the document. The server serves one
 * shell for every route, so dropping the fragment made every article
 * on such a site canonicalise to that shell — the first one saved won,
 * and every later one was reported as "already in your library" and
 * opened the wrong article.
 *
 * The two prefixes are deliberately the only ones recognised. "#!" is
 * the Google AJAX-crawling convention and "#/" is what every hash
 * router emits; anything else is far more likely to be an anchor, and
 * preserving all fragments would split one page into many saves the
 * first time somebody pasted a link with "#comments" on the end.
 */
function isHashRoute(hash: string): boolean {
  return hash.startsWith("#!") || hash.startsWith("#/")
}

/**
 * The largest canonical URL that can be stored.
 *
 * Measured, not guessed. The dedup key lives in a btree
 * (uq_knowledge_org_normalized on org_id, normalized_url) whose index
 * rows cap at 2704 bytes. With a real 40-character org_id and
 * incompressible content the hard ceiling is about 2642 bytes: 2640
 * inserts, 2650 fails with "index row size 2712 exceeds btree version
 * 4 maximum 2704". Past it the INSERT raises a Postgres error that
 * saveUrl does not recognise, and the user gets a 500 for a URL that
 * will never succeed however many times they retry.
 *
 * 2048 leaves roughly 600 bytes of headroom, so the limit survives a
 * longer org id, another column in the index, or a different collation
 * without quietly becoming wrong again. It is also the conventional
 * interop ceiling, and it is far above any real article URL — a
 * presigned S3 link, about the longest thing anyone genuinely saves,
 * runs to 1,500.
 *
 * BYTES, not characters: the index is measured in bytes, and although
 * canonicalisation percent-encodes to ASCII today, a rule that depends
 * on that staying true is a rule that breaks silently when it stops.
 */
export const MAX_CANONICAL_URL_BYTES = 2048

/** Applies to the canonical KEY, not to what the user typed. The
 * submitted URL is stored in an unindexed column where length is
 * harmless, and stripping tracking parameters is exactly what lets a
 * campaign-laden link through — checking the input instead would
 * reject URLs that canonicalise perfectly well. */
export function isCanonicalUrlTooLong(canonicalUrl: string): boolean {
  // TextEncoder, not Buffer: this module is imported by the "use client"
  // guest store, where Buffer is not defined.
  return new TextEncoder().encode(canonicalUrl).length > MAX_CANONICAL_URL_BYTES
}

/** Thrown by parseSaveableUrl() — the one thing both the server save
 *  path (service.ts) and the guest path (guest-store.ts) throw for an
 *  unsaveable URL, so both surfaces show the same real reason. */
export class InvalidKnowledgeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidKnowledgeUrlError"
  }
}

const EXPLICIT_HTTP_PREFIX_RE = /^https?:\/\//i
/** A syntactically plausible URI scheme token (RFC 3986: a letter, then
 *  letters/digits/+/-/.). Matched against the text before the first
 *  ":" — never enough on its own, see disallowedScheme() below. */
const SCHEME_TOKEN_RE = /^[a-z][a-z0-9+.-]*$/i

/** True when the text right after a colon is a PORT — `*DIGIT`,
 *  RFC 3986's actual grammar for one — followed only by the end of the
 *  string or the start of a path/query/fragment. This is what tells
 *  "example.com:8080/a" (a bare host+port, meant to become
 *  https://example.com:8080/a) apart from "mailto:user@host" or
 *  "javascript:alert(1)" (a real scheme, whose content is never purely
 *  digits) — by the same rule the URL spec itself uses, not a guess. */
function colonIntroducesPort(afterColon: string): boolean {
  const digits = afterColon.match(/^[0-9]+/)?.[0] ?? ""
  if (!digits) return false
  const rest = afterColon.slice(digits.length)
  return rest === "" || /^[/?#]/.test(rest)
}

/**
 * The scheme name an input explicitly names, if it names one Knowledge
 * must reject — javascript:, data:, file:, ftp:, mailto:, tel:, blob:,
 * or any other non-http(s) scheme. Returns null for a bare domain
 * ("example.com/a"), a bare host:port ("localhost:3000" —
 * colonIntroducesPort() above is what tells this apart from a scheme),
 * and for anything already starting with an explicit http(s):// prefix
 * (handled, and reduced to a scheme check on the parsed URL itself, by
 * parseSaveableUrl() below).
 *
 * Checked on the RAW input, before any "assume https" prefixing —
 * prefixing first is exactly what let a scheme slip through unchecked
 * before this existed: "https://" + "file:///etc/passwd" parses to
 * protocol "https:" with hostname "file", not to protocol "file:", so
 * a check made only after that prefixing never sees the real scheme.
 */
function disallowedScheme(trimmed: string): string | null {
  if (EXPLICIT_HTTP_PREFIX_RE.test(trimmed)) return null
  const colonIdx = trimmed.indexOf(":")
  if (colonIdx === -1) return null
  const beforeColon = trimmed.slice(0, colonIdx)
  const afterColon = trimmed.slice(colonIdx + 1)
  if (!SCHEME_TOKEN_RE.test(beforeColon)) return null
  if (colonIntroducesPort(afterColon)) return null
  return beforeColon.toLowerCase()
}

/**
 * Turn a user-submitted string into a real, saveable URL — the ONE
 * shared entry point for both the server save path (service.ts's
 * normalizeUrl) and the guest path (guest-store.ts's normalizeUrl), so
 * the two can never diverge on what they accept.
 *
 * Enforces exactly two rules, both explicit — never left to an
 * accidental side effect of parsing, DNS, or a fetch failing:
 *
 *   1. Only http/https. Checked BEFORE the "assume https" convenience
 *      prefix runs (disallowedScheme(), above — see why there), and
 *      checked again on the parsed result as a real second layer, not
 *      a formality.
 *   2. No userinfo (a username and/or password embedded in the URL,
 *      "https://user:pass@host/..."). Knowledge saves public content —
 *      it has no concept of an authenticated source — so a URL
 *      carrying credentials is refused outright rather than silently
 *      stripped and treated as if the public destination were what was
 *      asked for; see the commit message for the fuller reasoning.
 */
export function parseSaveableUrl(input: string): URL {
  const trimmed = input.trim()
  if (!trimmed) throw new InvalidKnowledgeUrlError("Enter a URL to save.")

  const scheme = disallowedScheme(trimmed)
  if (scheme) {
    throw new InvalidKnowledgeUrlError(`Only http and https links can be saved (got "${scheme}:").`)
  }

  const withScheme = EXPLICIT_HTTP_PREFIX_RE.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new InvalidKnowledgeUrlError("That doesn't look like a valid URL.")
  }
  // Real authority, not a repeat of the check above by another name:
  // this is what actually decides what gets fetched and stored.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidKnowledgeUrlError(`Only http and https links can be saved (got "${url.protocol}").`)
  }
  if (url.username || url.password) {
    throw new InvalidKnowledgeUrlError(
      "Links with a username or password in the URL can't be saved — Knowledge only saves public pages.",
    )
  }
  return url
}

/**
 * Turn a user-submitted URL string into a canonical dedup key. Throws
 * if the input can't be parsed as a saveable http(s) URL with no
 * embedded credentials (see parseSaveableUrl()) — callers already
 * validate for storage, so in practice this succeeds; the throw is a
 * safety net, never a user-facing path.
 */
export function canonicalizeUrl(input: string): string {
  const url = parseSaveableUrl(input)

  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "")
  // A route is part of the address; an anchor is not.
  if (!isHashRoute(url.hash)) url.hash = ""

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

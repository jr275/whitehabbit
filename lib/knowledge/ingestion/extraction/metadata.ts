/* ================================================================== *
 * METADATA EXTRACTION
 *
 * OpenGraph, Twitter cards, standard meta and JSON-LD, in a documented
 * precedence order. This is the same precedence chain Wallabag's
 * ContentProxy uses (Phase 1 §F.2) — the ordering is the reusable
 * knowledge; the implementation is ours.
 *
 * Every field is optional. Absence is normal and must never break a
 * caller: a page with no author, no date and no cover image is a
 * perfectly ordinary page.
 *
 * Pure module — no I/O, no dependencies.
 * ================================================================== */

import { htmlToText } from "./sanitize.ts"

const HEAD_LIMIT = 200_000 // metadata lives at the top; don't scan megabytes

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim()
}

/** Read a meta tag's content, tolerating attribute order. */
function meta(html: string, keyPattern: string): string | null {
  const head = html.slice(0, HEAD_LIMIT)
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${keyPattern}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name|itemprop)\\s*=\\s*["']${keyPattern}["']`, "i"),
  ]
  for (const re of patterns) {
    const m = re.exec(head)
    if (m?.[1]) {
      const value = decodeEntities(m[1])
      if (value.length > 0) return value
    }
  }
  return null
}

function firstOf(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta(html, key)
    if (value) return value
  }
  return null
}

export function extractTitle(html: string, siteName: string | null): string | null {
  const candidate =
    firstOf(html, ["og:title", "twitter:title"]) ??
    (() => {
      const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html.slice(0, HEAD_LIMIT))
      return m?.[1] ? decodeEntities(htmlToText(m[1])) : null
    })() ??
    (() => {
      const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
      return m?.[1] ? decodeEntities(htmlToText(m[1])) : null
    })()

  return cleanTitle(candidate, siteName)
}

/**
 * Normalise a title and drop the publisher's own boilerplate suffix.
 *
 * Exported because tier 1 needs it too: graby reports the raw <title>,
 * so " | Example Engineering" would otherwise reach the reader from one
 * tier and not the others. One rule, one place, same result whichever
 * tier won.
 */
export function cleanTitle(raw: string | null, siteName: string | null): string | null {
  if (!raw) return null
  let title = raw.replace(/\s+/g, " ").trim()

  // Strip a trailing " | Site Name" / " - Site Name" suffix.
  if (siteName) {
    const suffix = new RegExp(`\\s*[|\\-–—·]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i")
    title = title.replace(suffix, "").trim()
  }
  return title.length > 0 ? title.slice(0, 500) : null
}

export function extractAuthors(html: string): string[] {
  const raw =
    firstOf(html, ["author", "article:author", "og:article:author", "twitter:creator", "parsely-author", "sailthru\\.author"]) ??
    (() => {
      const m = /<[^>]+rel\s*=\s*["']author["'][^>]*>([\s\S]*?)<\//i.exec(html)
      return m?.[1] ? decodeEntities(htmlToText(m[1])) : null
    })()

  if (!raw) return []
  // A URL in article:author is a profile link, not a name.
  if (/^https?:\/\//i.test(raw)) return []

  return raw
    .split(/\s*(?:,| and |&)\s*/i)
    .map((a) => a.replace(/^by\s+/i, "").trim())
    .filter((a) => a.length > 1 && a.length < 120)
    .slice(0, 5)
}

export function extractPublishedAt(html: string): number | null {
  const raw = firstOf(html, [
    "article:published_time",
    "og:article:published_time",
    "datePublished",
    "publish[-_]date",
    "parsely-pub-date",
    "date",
  ])

  const candidate =
    raw ??
    (() => {
      const m = /<time[^>]+datetime\s*=\s*["']([^"']+)["']/i.exec(html)
      return m?.[1] ?? null
    })()

  if (!candidate) return null

  // Accept epoch seconds as well as date strings.
  const asInt = Number(candidate)
  const parsed = Number.isInteger(asInt) && candidate.length >= 9 && candidate.length <= 11
    ? asInt * 1000
    : Date.parse(candidate)

  if (!Number.isFinite(parsed)) return null
  // Reject implausible dates rather than storing a wrong one.
  const earliest = Date.parse("1990-01-01")
  const latest = Date.now() + 2 * 24 * 60 * 60 * 1000
  if (parsed < earliest || parsed > latest) return null
  return parsed
}

export function extractLanguage(html: string): string | null {
  const fromHtmlTag = /<html[^>]+lang\s*=\s*["']([^"']+)["']/i.exec(html.slice(0, HEAD_LIMIT))?.[1]
  const raw = fromHtmlTag ?? firstOf(html, ["og:locale", "language", "content-language"])
  if (!raw) return null
  const normalized = raw.trim().replace(/_/g, "-").toLowerCase()
  // Validate loosely as BCP-47 rather than storing anything at all.
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(normalized) ? normalized.slice(0, 20) : null
}

export function extractSiteName(html: string, domain: string): string | null {
  return firstOf(html, ["og:site_name", "application-name"]) ?? domain ?? null
}

export function extractImageUrl(html: string, baseUrl: string): string | null {
  const raw = firstOf(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"])
  const candidate = raw ?? /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? null
  if (!candidate) return null
  try {
    const resolved = new URL(candidate, baseUrl)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null
    return resolved.toString()
  } catch {
    return null
  }
}

export function extractFaviconUrl(html: string, baseUrl: string): string | null {
  const m =
    /<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(html.slice(0, HEAD_LIMIT)) ??
    /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*icon[^"']*["']/i.exec(html.slice(0, HEAD_LIMIT))
  try {
    return new URL(m?.[1] ?? "/favicon.ico", baseUrl).toString()
  } catch {
    return null
  }
}

export function extractExcerpt(html: string, fallbackText: string): string | null {
  const described = firstOf(html, ["og:description", "twitter:description", "description"])
  if (described && described.length > 0) return described.slice(0, 500)
  const trimmed = fallbackText.trim()
  return trimmed.length > 0 ? `${trimmed.slice(0, 300)}${trimmed.length > 300 ? "…" : ""}` : null
}

/**
 * The publisher's own idea of this page's address.
 *
 * Kept separate from the URL we fetched: they legitimately differ
 * (syndication, AMP, tracking-laden share links), and knowing the
 * publisher's canonical form is what lets a future milestone merge
 * duplicates that our URL canonicaliser cannot see are the same.
 */
export function extractCanonicalUrl(html: string, baseUrl: string): string | null {
  const head = html.slice(0, HEAD_LIMIT)
  const raw =
    /<link[^>]+rel\s*=\s*["\']canonical["\'][^>]*href\s*=\s*["\']([^"\']+)["\']/i.exec(head)?.[1] ??
    /<link[^>]+href\s*=\s*["\']([^"\']+)["\'][^>]*rel\s*=\s*["\']canonical["\']/i.exec(head)?.[1] ??
    firstOf(html, ["og:url"])
  if (!raw) return null
  try {
    const resolved = new URL(raw, baseUrl)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null
    return resolved.toString()
  } catch {
    return null
  }
}

/** Cap: an article with 400 images is a gallery page, and storing the
 * whole list buys nothing. */
const MAX_IMAGES = 40

/**
 * Every in-article image URL, absolute and de-duplicated.
 *
 * NOT downloaded. M2 deliberately leaves images external (see the M2
 * docs §10): downloading every image on every save is real bandwidth
 * and storage cost for a benefit no current feature needs. Recording
 * the list means a future milestone can archive selected images
 * without re-extracting.
 */
export function extractImages(html: string, baseUrl: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /<img\b[^>]*?\bsrc\s*=\s*["\']([^"\']+)["\']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && out.length < MAX_IMAGES) {
    const raw = m[1].trim()
    // Inline data URIs are not addressable resources; skip them.
    if (raw.length === 0 || /^data:/i.test(raw)) continue
    try {
      const resolved = new URL(raw, baseUrl)
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue
      const href = resolved.toString()
      if (seen.has(href)) continue
      seen.add(href)
      out.push(href)
    } catch {
      /* unresolvable src — skip */
    }
  }
  return out
}

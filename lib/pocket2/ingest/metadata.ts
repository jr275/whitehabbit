import "server-only"

/* ================================================================== *
 * METADATA EXTRACTION — turns fetched HTML into the fields a card
 * shows.
 *
 * Everything read here was written by someone else's web server, so
 * every value is treated as hostile input: length-capped, whitespace-
 * normalized, and — for anything that becomes a URL — resolved and
 * scheme-checked before it can reach an `src` or an `href`.
 *
 * Precedence, most trustworthy first:
 *   OpenGraph -> Twitter cards -> JSON-LD -> standard <meta> -> <title>
 * because that is roughly the order of how deliberately a publisher
 * curated the value.
 * ================================================================== */

import { parseHTML } from "linkedom"
import type { ContentType } from "@/lib/pocket2/domain/types"

const MAX_TITLE = 300
const MAX_DESCRIPTION = 1000
const MAX_AUTHOR = 160

export interface PageMetadata {
  title: string | null
  description: string | null
  author: string | null
  imageUrl: string | null
  faviconUrl: string | null
  publishedAt: number | null
  siteName: string | null
  /** what the page says it is — OG type, schema.org @type, etc. Fed to
   * the classifier alongside the URL shape. */
  declaredType: string | null
  language: string | null
  /** a <meta name="robots"> noarchive, which is a request not to keep
   * a stored copy — honoured the same as the X-Robots-Tag header */
  noArchive: boolean
}

function clean(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** Resolves a possibly-relative URL against the page, and refuses
 * anything that is not http(s). Without this check a page could put
 * `javascript:` or a `data:` payload into og:image and have it
 * rendered as a card cover. */
function safeAbsoluteUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null
  try {
    const resolved = new URL(value.trim(), base)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null
    return resolved.toString()
  } catch {
    return null
  }
}

/** Publication dates arrive in a dozen formats and some are simply
 * wrong. A date that does not parse, or that is implausible, is
 * dropped rather than guessed at — a card with no date is honest, a
 * card dated 1970 is not. */
function parseDate(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value.trim())
  if (!Number.isFinite(ms)) return null
  const year = new Date(ms).getUTCFullYear()
  if (year < 1990 || ms > Date.now() + 86_400_000) return null
  return ms
}

type Doc = ReturnType<typeof parseHTML>["document"]

function metaContent(doc: Doc, selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = doc.querySelector(selector)
    const content = el?.getAttribute("content") ?? el?.getAttribute("href") ?? el?.textContent
    const value = clean(content, 4000)
    if (value) return value
  }
  return null
}

/** JSON-LD is the richest source when present, and the most likely to
 * be malformed. Every block is parsed defensively — one broken script
 * tag must not cost us the metadata in the next one. */
function readJsonLd(doc: Doc): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.textContent
    if (!raw || raw.length > 200_000) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      const candidates = Array.isArray(parsed) ? parsed : [parsed]
      for (const candidate of candidates) {
        if (candidate && typeof candidate === "object") {
          const node = candidate as Record<string, unknown>
          blocks.push(node)
          // @graph is how many CMSs wrap the actual entities
          const graph = node["@graph"]
          if (Array.isArray(graph)) {
            for (const entry of graph) {
              if (entry && typeof entry === "object") blocks.push(entry as Record<string, unknown>)
            }
          }
        }
      }
    } catch {
      continue
    }
  }
  return blocks
}

function jsonLdString(blocks: Record<string, unknown>[], keys: string[]): string | null {
  for (const block of blocks) {
    for (const key of keys) {
      const value = block[key]
      if (typeof value === "string" && value.trim()) return value
      // author is frequently { "@type": "Person", "name": "..." }
      if (value && typeof value === "object") {
        const named = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | undefined
        const name = named?.name
        if (typeof name === "string" && name.trim()) return name
      }
    }
  }
  return null
}

export function extractMetadata(html: string, pageUrl: string): PageMetadata {
  const { document } = parseHTML(html)
  const jsonLd = readJsonLd(document)

  const robotsMeta = (document.querySelector('meta[name="robots" i]')?.getAttribute("content") ?? "").toLowerCase()

  const title =
    clean(metaContent(document, ['meta[property="og:title"]', 'meta[name="twitter:title"]']), MAX_TITLE) ??
    clean(jsonLdString(jsonLd, ["headline", "name"]), MAX_TITLE) ??
    clean(document.querySelector("title")?.textContent, MAX_TITLE)

  const description =
    clean(metaContent(document, [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description" i]',
    ]), MAX_DESCRIPTION) ?? clean(jsonLdString(jsonLd, ["description"]), MAX_DESCRIPTION)

  const author =
    clean(metaContent(document, [
      'meta[name="author" i]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
    ]), MAX_AUTHOR) ?? clean(jsonLdString(jsonLd, ["author", "creator"]), MAX_AUTHOR)

  const imageUrl =
    safeAbsoluteUrl(metaContent(document, [
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]), pageUrl) ?? safeAbsoluteUrl(jsonLdString(jsonLd, ["image", "thumbnailUrl"]), pageUrl)

  const faviconUrl = safeAbsoluteUrl(
    metaContent(document, [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
    ]),
    pageUrl,
  )

  const publishedAt =
    parseDate(metaContent(document, [
      'meta[property="article:published_time"]',
      'meta[name="date" i]',
      'meta[property="og:updated_time"]',
      "time[datetime]",
    ])) ?? parseDate(jsonLdString(jsonLd, ["datePublished", "dateCreated"]))

  return {
    title,
    description,
    author,
    imageUrl,
    faviconUrl,
    publishedAt,
    siteName: clean(metaContent(document, ['meta[property="og:site_name"]']), 120),
    declaredType:
      clean(metaContent(document, ['meta[property="og:type"]']), 80) ??
      clean(typeof jsonLd[0]?.["@type"] === "string" ? jsonLd[0]["@type"] : null, 80),
    language: clean(document.querySelector("html")?.getAttribute("lang"), 20),
    noArchive: robotsMeta.includes("noarchive") || robotsMeta.includes("none"),
  }
}

/* ---- classification ---------------------------------------------- */

/** Hosts whose content is definitively of one kind regardless of what
 * their OG tags claim. Kept deliberately short: a long list of
 * hardcoded domains is a maintenance burden that ages badly, and the
 * signals below generalize. */
const HOST_TYPES: { pattern: RegExp; type: ContentType }[] = [
  { pattern: /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)$/i, type: "video" },
  { pattern: /(^|\.)(spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts\.com)$/i, type: "podcast" },
  { pattern: /(^|\.)(twitter\.com|x\.com|bsky\.app|mastodon\.\w+|threads\.net|linkedin\.com)$/i, type: "social_post" },
  { pattern: /(^|\.)(amazon\.\w+|etsy\.com|ebay\.\w+|shopify\.com)$/i, type: "product" },
]

const OG_TYPE_MAP: Record<string, ContentType> = {
  article: "article",
  "article:news": "news",
  video: "video",
  "video.other": "video",
  "video.movie": "video",
  "video.episode": "video",
  music: "podcast",
  "music.song": "podcast",
  book: "document",
  product: "product",
  profile: "social_post",
  website: "website",
}

const SCHEMA_TYPE_MAP: Record<string, ContentType> = {
  newsarticle: "news",
  article: "article",
  blogposting: "blog_post",
  techarticle: "article",
  report: "document",
  videoobject: "video",
  podcastepisode: "podcast",
  audioobject: "podcast",
  product: "product",
  socialmediaposting: "social_post",
}

/**
 * Decide what a saved URL actually is.
 *
 * Signals in order of authority: the host (a YouTube link is a video
 * whatever its markup says), then the page's own schema.org type, then
 * its OpenGraph type, then the file extension, then whether real
 * article text was extracted.
 *
 * Returns "website" rather than "article" when nothing indicates prose
 * — claiming an unknown page is a readable article is precisely the
 * kind of confident-but-wrong classification that makes the Reader
 * look broken.
 */
export function classifyContent(
  url: string,
  meta: PageMetadata,
  signals: { hasArticleText: boolean; wordCount: number },
): ContentType {
  let host = ""
  let pathname = ""
  try {
    const parsed = new URL(url)
    host = parsed.hostname.replace(/^www\./, "")
    pathname = parsed.pathname.toLowerCase()
  } catch {
    return "unknown"
  }

  for (const { pattern, type } of HOST_TYPES) {
    if (pattern.test(host)) return type
  }

  if (/\.(pdf|docx?|pptx?|epub|rtf)$/.test(pathname)) return "document"

  const declared = meta.declaredType?.toLowerCase().trim()
  if (declared) {
    const bySchema = SCHEMA_TYPE_MAP[declared]
    if (bySchema) return bySchema
    const byOg = OG_TYPE_MAP[declared]
    if (byOg) return byOg
  }

  // A news-shaped URL (/2026/03/15/slug) is a strong signal, and one
  // publishers are consistent about.
  if (/\/\d{4}\/\d{1,2}\/\d{1,2}\//.test(pathname)) return "news"
  if (/\/(blog|posts?)\//.test(pathname)) return "blog_post"

  if (signals.hasArticleText && signals.wordCount >= 250) return "article"
  return "website"
}

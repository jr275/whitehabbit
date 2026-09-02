import "server-only"

/* ================================================================== *
 * EXTRACTION — turns really-fetched HTML into clean, structured
 * content. Dependency-free by design (no jsdom/readability): the
 * project's whole stack is deliberately lean, and a focused metadata +
 * main-text extractor covers the article/blog/news pages this product
 * saves. It never fabricates fields — anything it can't find from the
 * real markup stays undefined, and the caller persists that honestly
 * (a NULL column, not a placeholder).
 * ================================================================== */

export interface ExtractedContent {
  title?: string
  author?: string
  siteName?: string
  excerpt?: string
  imageUrl?: string
  canonicalUrl?: string
  publishedAt?: number
  lang?: string
  kind: "article" | "video" | "pdf" | "podcast" | "social" | "document"
  tags: string[]
  contentText?: string
  wordCount?: number
  readingMin?: number
}

/* ---- small HTML helpers ------------------------------------------ */

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n))
      } catch {
        return ""
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(Number.parseInt(h, 16))
      } catch {
        return ""
      }
    })
}

/** Read a <meta> content value by property/name, trying several keys. */
function meta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    // property="og:title" content="..." OR content="..." property="og:title"
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m?.[1]) {
        const v = decodeEntities(m[1]).trim()
        if (v) return v
      }
    }
  }
  return undefined
}

function attr(html: string, tag: string, attrName: string, matchAttr: string, matchVal: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]+${matchAttr}=["']${matchVal}["'][^>]*${attrName}=["']([^"']*)["']`, "i")
  const m = html.match(re)
  return m?.[1] ? decodeEntities(m[1]).trim() : undefined
}

function stripTag(html: string, tag: string): string {
  return html.replace(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "gi"), " ")
}

/** Convert a chunk of HTML into paragraph-separated readable text. */
function htmlToText(html: string): string {
  let s = html
  // drop non-content elements entirely
  for (const tag of ["script", "style", "noscript", "svg", "form", "nav", "aside", "footer", "header"]) {
    s = stripTag(s, tag)
  }
  // block boundaries → newlines so paragraphs survive
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|blockquote|br)\s*>/gi, "\n")
  s = s.replace(/<br\s*\/?>/gi, "\n")
  // remaining tags → gone
  s = s.replace(/<[^>]+>/g, " ")
  s = decodeEntities(s)
  // normalize whitespace, keep paragraph breaks
  const paragraphs = s
    .split(/\n+/)
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line.length > 0)
  return paragraphs.join("\n\n")
}

/** Pick the densest text container as the article body. Heuristic but
 * real: prefers <article>, then the <main>, then the largest <div>. */
function extractBody(html: string): string | undefined {
  const candidates: string[] = []
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0]
  if (article) candidates.push(article)
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0]
  if (main) candidates.push(main)

  let best = ""
  let bestScore = 0
  for (const c of candidates) {
    const text = htmlToText(c)
    if (text.length > bestScore) {
      best = text
      bestScore = text.length
    }
  }
  // Fallback: whole body, largest paragraph cluster
  if (bestScore < 400) {
    const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html
    const text = htmlToText(body)
    if (text.length > bestScore) best = text
  }
  best = best.trim()
  return best.length >= 200 ? best : undefined
}

/** Resolve a possibly-relative URL (e.g. "/img/a.jpg", "//cdn/x.png")
 * against the page URL into an absolute http(s) URL. Returns undefined
 * when the value is empty, a data: URI, or cannot be resolved — the
 * caller then persists NULL rather than a broken/relative src. */
function resolveUrl(maybe: string | undefined, base: string): string | undefined {
  if (!maybe) return undefined
  const v = maybe.trim()
  if (!v || v.startsWith("data:")) return undefined
  try {
    const abs = new URL(v, base)
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return undefined
    return abs.toString()
  } catch {
    return undefined
  }
}

/** Priority-3 fallback when there's no og:image/twitter:image: a
 * declared <link rel="image_src">, then the first reasonably-sized
 * in-content <img>. Heuristic but real — it only ever returns a URL
 * that genuinely appears in the page markup, never a stock/random one. */
function findFeaturedImage(html: string): string | undefined {
  const linkImg = attr(html, "link", "href", "rel", "image_src")
  if (linkImg) return linkImg

  // Prefer images inside the main content region, if identifiable.
  const region =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html

  for (const m of region.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0]
    // Skip tiny/tracking pixels and sprites/icons by obvious signals.
    if (/\b(?:width|height)=["']?(?:1|0)["']?/i.test(tag)) continue
    if (/sprite|icon|logo|avatar|pixel|tracking|blank|spacer/i.test(tag)) continue
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ??
      // srcset — take the first candidate URL
      tag.match(/\bsrcset=["']([^"'\s,]+)/i)?.[1]
    const decoded = src ? decodeEntities(src).trim() : undefined
    if (decoded) return decoded
  }
  return undefined
}

/** Best-effort favicon / site icon URL, resolved to absolute. Falls
 * back to the origin's /favicon.ico, which is a real convention (not a
 * fabricated asset). Used for the small source glyph, never as a cover. */
export function extractFavicon(html: string, url: string): string | undefined {
  const rels = ["apple-touch-icon", "icon", "shortcut icon"]
  for (const rel of rels) {
    const href = attr(html, "link", "href", "rel", rel)
    const abs = resolveUrl(href, url)
    if (abs) return abs
  }
  try {
    return new URL("/favicon.ico", url).toString()
  } catch {
    return undefined
  }
}

function inferKind(url: string, html: string): ExtractedContent["kind"] {
  const u = url.toLowerCase()
  if (u.endsWith(".pdf")) return "pdf"
  if (/youtube\.com\/watch|youtu\.be\/|vimeo\.com\//.test(u)) return "video"
  if (/twitter\.com|x\.com|mastodon|threads\.net|bsky\.app/.test(u)) return "social"
  const ogType = meta(html, ["og:type"])
  if (ogType === "video" || ogType === "video.other") return "video"
  if (ogType === "music.song" || ogType === "music.album") return "podcast"
  if (/<meta[^>]+property=["']og:audio["']/i.test(html)) return "podcast"
  return "article"
}

function parseDate(s: string | undefined): number | undefined {
  if (!s) return undefined
  const t = Date.parse(s)
  return Number.isNaN(t) ? undefined : t
}

/**
 * Extract everything we can from a real HTML string. `url` is the URL
 * that produced this HTML (used for kind inference and domain fallback).
 */
export function extractFromHtml(html: string, url: string): ExtractedContent {
  const title =
    meta(html, ["og:title", "twitter:title"]) ??
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]).trim() : undefined)

  const excerpt = meta(html, ["og:description", "twitter:description", "description"])
  const siteName = meta(html, ["og:site_name", "application-name"])
  const author = meta(html, ["author", "article:author", "twitter:creator"])
  // Cover image priority: og:image → twitter:image → declared featured
  // image / first in-content <img>. Whatever we find is resolved to an
  // absolute URL against the page (many sites use relative og:image),
  // and anything unresolvable becomes undefined → persisted as NULL so
  // the card falls back to the editorial cover instead of a broken src.
  const rawImage =
    meta(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]) ??
    findFeaturedImage(html)
  const imageUrl = resolveUrl(rawImage, url)
  const canonicalUrl =
    resolveUrl(attr(html, "link", "href", "rel", "canonical"), url) ?? resolveUrl(meta(html, ["og:url"]), url)
  const publishedAt = parseDate(meta(html, ["article:published_time", "og:article:published_time", "datePublished", "date"]))
  const lang = html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1]?.slice(0, 8)

  const tagsRaw = [meta(html, ["keywords"]) ?? ""]
    .join(",")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  // article:tag can appear multiple times
  const articleTags = [...html.matchAll(/<meta[^>]+property=["']article:tag["'][^>]*content=["']([^"']+)["']/gi)].map((m) =>
    decodeEntities(m[1]).trim(),
  )
  const tags = [...new Set([...tagsRaw, ...articleTags])].filter(Boolean).slice(0, 8)

  const contentText = extractBody(html)
  const wordCount = contentText ? contentText.split(/\s+/).filter(Boolean).length : undefined
  const readingMin = wordCount ? Math.max(1, Math.round(wordCount / 225)) : undefined

  return {
    title,
    author,
    siteName,
    excerpt,
    imageUrl,
    canonicalUrl,
    publishedAt,
    lang,
    kind: inferKind(url, html),
    tags,
    contentText,
    wordCount,
    readingMin,
  }
}

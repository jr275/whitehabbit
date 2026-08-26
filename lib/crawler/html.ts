/* ================================================================== *
 * HTML EXTRACTION — regex-based, deliberately minimal (no DOM parser
 * dependency; matches lib/agent/tools/browser.ts's own extractText()
 * approach). Good enough for a bounded first-generation crawler
 * against real, reasonably well-formed HTML and the deterministic
 * test fixture (docs/architecture/vertical-slice.md); will not handle
 * JS-rendered content — a named, accepted limitation, not a silent
 * gap (see docs/architecture/risks.md).
 * ================================================================== */

export const MAX_EXTRACTED_TEXT = 20_000

export interface ExtractedPage {
  title: string
  description: string | null
  canonicalUrl: string | null
  text: string
  wordCount: number
  jsonLd: unknown[]
  links: { href: string; text: string; rel: string | null }[]
  robotsMeta: string | null
  htmlLang: string | null
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractAttr(tag: string, attr: string): string | null {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i"))
  return match ? decodeEntities(match[1].trim()) : null
}

export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()).replace(/\s+/g, " ") : ""

  const htmlTagMatch = html.match(/<html\b[^>]*>/i)
  const htmlLang = htmlTagMatch ? extractAttr(htmlTagMatch[0], "lang") : null

  let description: string | null = null
  let canonicalUrl: string | null = null
  let robotsMeta: string | null = null
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  const head = headMatch ? headMatch[1] : html
  for (const tagMatch of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = tagMatch[0]
    const name = (extractAttr(tag, "name") || "").toLowerCase()
    const property = (extractAttr(tag, "property") || "").toLowerCase()
    if (name === "description" || property === "og:description") {
      description = description ?? extractAttr(tag, "content")
    }
    if (name === "robots") {
      robotsMeta = extractAttr(tag, "content")
    }
  }
  for (const tagMatch of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = tagMatch[0]
    if ((extractAttr(tag, "rel") || "").toLowerCase() === "canonical") {
      const href = extractAttr(tag, "href")
      if (href) canonicalUrl = new URL(href, baseUrl).toString()
    }
  }

  // JSON-LD — every well-formed <script type="application/ld+json">
  // block; malformed JSON is skipped, never guessed at.
  const jsonLd: unknown[] = []
  for (const scriptMatch of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(scriptMatch[1].trim())
      jsonLd.push(parsed)
    } catch {
      // not valid JSON — skip rather than fabricate structured data
    }
  }

  // links — real anchors only, resolved to absolute URLs against baseUrl
  const links: { href: string; text: string; rel: string | null }[] = []
  for (const anchorMatch of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const tag = `<a${anchorMatch[1]}>`
    const href = extractAttr(tag, "href")
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue
    let absolute: string
    try {
      absolute = new URL(href, baseUrl).toString()
    } catch {
      continue
    }
    const text = decodeEntities(anchorMatch[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    links.push({ href: absolute, text, rel: extractAttr(tag, "rel") })
  }

  const withoutNonContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
  const text = decodeEntities(withoutNonContent.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT)
  const wordCount = text ? text.split(/\s+/).length : 0

  return { title, description, canonicalUrl, text, wordCount, jsonLd, links, robotsMeta, htmlLang }
}

/* ================================================================== *
 * READABILITY — content-density heuristic (extraction tier 2).
 *
 * Finds the article body inside a page full of navigation, sidebars,
 * comments and footers. This is the same *idea* as php-readability,
 * which Wallabag uses as its fallback tier (Phase 1 §F.1) — the
 * approach is the reusable knowledge; the implementation is ours,
 * because Milestone 1 is zero-new-dependencies and there is no DOM
 * library available.
 *
 * Strategy, in order:
 *   1. semantic containers  — <article>, <main>, [role=main]
 *   2. scored candidates    — containers whose id/class looks like
 *                             content, ranked by paragraph density
 *   3. <body>               — last resort
 *
 * Tier 1 (the graby sidecar, carrying Wallabag's per-domain XPath
 * site-config corpus) is what makes extraction genuinely good on
 * awkward publishers. It slots in ahead of this behind the same
 * ContentExtractor interface. This tier is honest about being a
 * heuristic; it is not pretending to be that corpus.
 *
 * Pure module — no I/O.
 * ================================================================== */

import { countWords, htmlToText, stripDangerousBlocks } from "./sanitize.ts"

/** Chrome that is never article body, dropped with its contents. */
const CHROME_TAGS = ["nav", "header", "footer", "aside"]

/** id/class fragments that mark a container as NOT the article. */
const NEGATIVE = /(^|[-_\s])(nav|menu|sidebar|side-bar|footer|header|masthead|comment|disqus|share|social|related|recommend|promo|advert|advertisement|banner|popup|modal|cookie|consent|newsletter|subscribe|paywall|breadcrumb|pagination|widget|tags?|meta|byline|author-bio|toolbar|skip)([-_\s]|$)/i

/** id/class fragments that mark a container as LIKELY the article. */
const POSITIVE = /(^|[-_\s])(article|post|content|story|entry|body|main|text|prose|markdown)([-_\s]|$)/i

interface Candidate {
  html: string
  score: number
}

/** Remove page chrome with its contents. */
function stripChrome(html: string): string {
  let out = html
  for (const tag of CHROME_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ")
  }
  return out
}

/**
 * Extract the inner HTML of every balanced occurrence of `tag`.
 *
 * Regex cannot match nested tags, so this walks the string tracking
 * depth — which is what makes <div> extraction possible at all.
 */
function blocksOf(html: string, tag: string): { inner: string; attrs: string }[] {
  const results: { inner: string; attrs: string }[] = []
  const open = new RegExp(`<${tag}\\b((?:"[^"]*"|'[^']*'|[^>"'])*)>`, "gi")
  const boundary = new RegExp(`<(\\/?)${tag}\\b(?:"[^"]*"|'[^']*'|[^>"'])*>`, "gi")

  let m: RegExpExecArray | null
  while ((m = open.exec(html)) !== null) {
    const attrs = m[1] ?? ""
    const contentStart = m.index + m[0].length
    let depth = 1
    boundary.lastIndex = contentStart

    let b: RegExpExecArray | null
    while ((b = boundary.exec(html)) !== null) {
      depth += b[1] === "/" ? -1 : 1
      if (depth === 0) {
        results.push({ inner: html.slice(contentStart, b.index), attrs })
        open.lastIndex = b.index // don't rescan nested opens we consumed
        break
      }
    }
    if (depth !== 0) break // unbalanced document; stop rather than guess
  }
  return results
}

function identityOf(attrs: string): string {
  const id = /\bid\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? ""
  const cls = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? ""
  return `${id} ${cls}`
}

/**
 * Density score. Paragraph count matters more than raw length: a long
 * block of link text is navigation, a block of <p> tags is prose.
 */
function scoreBlock(inner: string, attrs: string): number {
  const text = htmlToText(inner)
  const words = countWords(text)
  if (words < 50) return 0

  const paragraphs = (inner.match(/<p\b/gi) ?? []).length
  const links = (inner.match(/<a\b/gi) ?? []).length
  const linkWords = countWords(
    (inner.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) ?? []).map((a) => htmlToText(a)).join(" "),
  )

  // A block that is mostly link text is a menu, whatever it is called.
  const linkDensity = words > 0 ? linkWords / words : 1
  if (linkDensity > 0.5) return 0

  let score = words + paragraphs * 30 - links * 5
  score *= 1 - linkDensity

  const identity = identityOf(attrs)
  if (NEGATIVE.test(identity)) score *= 0.1
  if (POSITIVE.test(identity)) score *= 1.5

  return score
}

function bestOf(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null
  for (const c of candidates) {
    if (c.score > 0 && (!best || c.score > best.score)) best = c
  }
  return best
}

/**
 * Returns the article body HTML, or null when the page has no usable
 * prose (a paywall stub, a login wall, a pure navigation page).
 */
export function extractArticleHtml(rawHtml: string): string | null {
  const cleaned = stripChrome(stripDangerousBlocks(rawHtml))

  // 1. semantic containers, trusted without scoring competition
  for (const tag of ["article", "main"]) {
    const blocks = blocksOf(cleaned, tag)
    const scored = blocks.map((b) => ({ html: b.inner, score: scoreBlock(b.inner, b.attrs) }))
    const best = bestOf(scored)
    if (best) return best.html
  }

  // 2. scored div/section candidates
  const candidates: Candidate[] = []
  for (const tag of ["div", "section"]) {
    for (const block of blocksOf(cleaned, tag)) {
      const score = scoreBlock(block.inner, block.attrs)
      if (score > 0) candidates.push({ html: block.inner, score })
    }
  }
  const best = bestOf(candidates)
  if (best) return best.html

  // 3. body — accepted only if it genuinely contains prose
  const body = blocksOf(cleaned, "body")[0]?.inner ?? cleaned
  return countWords(htmlToText(body)) >= 50 ? body : null
}

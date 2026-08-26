import "server-only"

/* ================================================================== *
 * CRAWL ORCHESTRATOR — a real, bounded, robots-aware, SSRF-safe BFS
 * crawl. See §3-4 of the vertical-slice brief and
 * docs/architecture/domain-model.md.
 *
 * Every fetch goes through lib/crawler/safe-fetch.ts (SSRF-guarded,
 * redirect-revalidated). Bounded by CrawlLimits — this proves the
 * mechanism (§38: "do not overbuild"), it does not attempt to index an
 * entire site.
 * ================================================================== */

import { createHash } from "node:crypto"
import { extractPage } from "./html"
import type { Crawl, CrawlLimits, CrawlPage } from "./model"
import { createCrawl, createCrawlLink, createDiscoveredPage, finalizeCrawl, recordCrawlResult } from "./repo"
import { isAllowedByRobots, parseRobots, type RobotsRules } from "./robots"
import { safeFetch, type SafeFetchFn } from "./safe-fetch"
import { discoverSitemapUrls } from "./sitemap"

export const CRAWLER_USER_AGENT = "WhitehabbitBot/0.1 (+https://whitehabbit.example/bot)"

interface QueueItem {
  url: string
  depth: number
  parentUrl: string | null
}

function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    u.hash = ""
    if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1)
    return u.toString()
  } catch {
    return null
  }
}

function isNoindex(robotsMeta: string | null): boolean {
  return !!robotsMeta && robotsMeta.toLowerCase().includes("noindex")
}

export async function runCrawl(params: {
  orgId: string
  projectId: string
  websiteId: string
  agentRunId: string | null
  startUrl: string
  limits: CrawlLimits
  /** Injectable only for tests (§32-33: a deterministic fixture
   * website, never a live network fetch) — production code never
   * passes this, so every real crawl always goes through the real,
   * SSRF-guarded safeFetch(). */
  fetchPage?: SafeFetchFn
}): Promise<{ crawl: Crawl; pages: CrawlPage[] }> {
  const { orgId, projectId, websiteId, agentRunId, startUrl, limits } = params
  const fetchPage = params.fetchPage ?? safeFetch
  const start = new URL(startUrl)
  const origin = start.origin
  const hostname = start.hostname

  const crawl = await createCrawl({ orgId, projectId, websiteId, agentRunId, maxPages: limits.maxPages, maxDepth: limits.maxDepth })

  let robots: RobotsRules = { disallow: [], allow: [], sitemaps: [] }
  try {
    const robotsResult = await fetchPage(`${origin}/robots.txt`, { timeoutMs: limits.requestTimeoutMs, maxBytes: 200_000, accept: "text/plain" })
    if (robotsResult.ok) robots = parseRobots(robotsResult.body)
  } catch {
    // no reachable robots.txt — proceed as if everything is allowed,
    // matching every major crawler's real behavior in that case
  }

  let sitemapSeeds: string[] = []
  try {
    const candidates = robots.sitemaps.length > 0 ? robots.sitemaps : [`${origin}/sitemap.xml`]
    const sitemapResult = await discoverSitemapUrls(candidates, { maxUrls: limits.maxPages * 2, maxSitemapFiles: 5, timeoutMs: limits.requestTimeoutMs }, fetchPage)
    sitemapSeeds = sitemapResult.urls.filter((u) => {
      try {
        return new URL(u).hostname === hostname
      } catch {
        return false
      }
    })
  } catch {
    // no sitemap — the homepage + discovered links are still real seeds
  }

  const visited = new Set<string>()
  const pages: CrawlPage[] = []
  const pageIdByUrl = new Map<string, string>()
  let errorCount = 0

  const normalizedStart = normalizeUrl(startUrl)
  if (!normalizedStart) {
    await finalizeCrawl(crawl.id, "failed", { pagesDiscovered: 0, pagesCrawled: 0, errorCount: 1 })
    return { crawl: { ...crawl, status: "failed" }, pages: [] }
  }

  const queue: QueueItem[] = [{ url: normalizedStart, depth: 0, parentUrl: null }]
  for (const seed of sitemapSeeds) {
    const normalized = normalizeUrl(seed)
    if (normalized && normalized !== normalizedStart) queue.push({ url: normalized, depth: 0, parentUrl: null })
  }

  while (queue.length > 0 && pages.length < limits.maxPages) {
    const batch: QueueItem[] = []
    while (queue.length > 0 && batch.length < limits.maxConcurrency && pages.length + batch.length < limits.maxPages) {
      const item = queue.shift()!
      if (visited.has(item.url)) continue
      visited.add(item.url)
      batch.push(item)
    }
    if (batch.length === 0) break

    const results = await Promise.all(
      batch.map(async (item): Promise<{ item: QueueItem; page: CrawlPage; links: { href: string; text: string; rel: string | null }[] }> => {
        const path = new URL(item.url).pathname || "/"
        const allowed = isAllowedByRobots(robots, path)
        const discovered = await createDiscoveredPage({
          orgId,
          projectId,
          crawlId: crawl.id,
          websiteId,
          url: item.url,
          crawlDepth: item.depth,
          parentUrl: item.parentUrl,
        })

        if (!allowed) {
          await recordCrawlResult(discovered.id, { statusCode: null, robotsAllowed: false, indexable: false })
          return { item, page: { ...discovered, robotsAllowed: false, indexable: false }, links: [] }
        }

        const fetched = await fetchPage(item.url, { timeoutMs: limits.requestTimeoutMs, maxBytes: limits.maxBytesPerResponse })
        if (!fetched.ok) {
          await recordCrawlResult(discovered.id, { statusCode: fetched.status || null, robotsAllowed: true, indexable: false, error: fetched.error ?? `HTTP ${fetched.status}` })
          return { item, page: { ...discovered, statusCode: fetched.status || null, error: fetched.error ?? `HTTP ${fetched.status}`, indexable: false }, links: [] }
        }

        const isHtml = !fetched.contentType || fetched.contentType.includes("html")
        if (!isHtml) {
          await recordCrawlResult(discovered.id, { statusCode: fetched.status, contentType: fetched.contentType, robotsAllowed: true, indexable: false })
          return { item, page: { ...discovered, statusCode: fetched.status, contentType: fetched.contentType, indexable: false }, links: [] }
        }

        const extracted = extractPage(fetched.body, fetched.finalUrl)
        const contentHash = createHash("sha256").update(extracted.text).digest("hex")
        const indexable = !isNoindex(extracted.robotsMeta)
        await recordCrawlResult(discovered.id, {
          canonicalUrl: extracted.canonicalUrl,
          statusCode: fetched.status,
          contentType: fetched.contentType,
          title: extracted.title,
          description: extracted.description,
          language: extracted.htmlLang,
          extractedText: extracted.text,
          structuredData: extracted.jsonLd,
          wordCount: extracted.wordCount,
          contentHash,
          robotsAllowed: true,
          indexable,
        })
        return {
          item,
          page: {
            ...discovered,
            canonicalUrl: extracted.canonicalUrl,
            statusCode: fetched.status,
            contentType: fetched.contentType,
            title: extracted.title,
            description: extracted.description,
            language: extracted.htmlLang,
            extractedText: extracted.text,
            structuredData: extracted.jsonLd,
            wordCount: extracted.wordCount,
            contentHash,
            indexable,
            crawledAt: Date.now(),
          },
          links: extracted.links,
        }
      }),
    )

    for (const { item, page, links } of results) {
      pages.push(page)
      pageIdByUrl.set(item.url, page.id)
      if (page.error) errorCount += 1

      for (const link of links.slice(0, 100)) {
        const normalized = normalizeUrl(link.href)
        if (!normalized) continue
        let linkHostname: string
        try {
          linkHostname = new URL(normalized).hostname
        } catch {
          continue
        }
        const isInternal = linkHostname === hostname
        await createCrawlLink({
          orgId,
          crawlId: crawl.id,
          sourcePageId: page.id,
          targetUrl: normalized,
          anchorText: link.text || null,
          rel: link.rel,
          isInternal,
        })
        if (isInternal && !visited.has(normalized) && item.depth + 1 <= limits.maxDepth && pages.length + queue.length < limits.maxPages) {
          queue.push({ url: normalized, depth: item.depth + 1, parentUrl: item.url })
        }
      }
    }
  }

  const status = errorCount > 0 && pages.every((p) => p.error) ? "failed" : "completed"
  await finalizeCrawl(crawl.id, status, { pagesDiscovered: pages.length, pagesCrawled: pages.filter((p) => p.crawledAt).length, errorCount })
  return { crawl: { ...crawl, status, pagesDiscovered: pages.length, pagesCrawled: pages.filter((p) => p.crawledAt).length, errorCount }, pages }
}

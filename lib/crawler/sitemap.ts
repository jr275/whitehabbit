/* ================================================================== *
 * SITEMAP DISCOVERY — a real, bounded fetch of sitemap.xml (or the
 * URLs a real robots.txt named), following one level of sitemap-index
 * nesting. Regex-based <loc> extraction — no XML parser dependency,
 * matching this crawler's overall "smallest reusable abstraction"
 * approach (lib/crawler/html.ts).
 * ================================================================== */

import "server-only"

import { safeFetch, type SafeFetchFn } from "./safe-fetch"

export interface SitemapDiscoveryResult {
  urls: string[]
  sitemapsFetched: string[]
  errors: string[]
}

function extractLocs(xml: string): string[] {
  const locs: string[] = []
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    locs.push(match[1].trim())
  }
  return locs
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml)
}

/** Fetches `candidateSitemapUrls` in order (real robots.txt Sitemap:
 * lines first, then a bare /sitemap.xml guess), following one level of
 * <sitemapindex> nesting, bounded by `maxUrls` total and
 * `maxSitemapFiles` fetched — never an unbounded recursive crawl of
 * sitemap files. */
export async function discoverSitemapUrls(
  candidateSitemapUrls: string[],
  opts: { maxUrls: number; maxSitemapFiles: number; timeoutMs: number },
  fetchImpl: SafeFetchFn = safeFetch,
): Promise<SitemapDiscoveryResult> {
  const urls = new Set<string>()
  const sitemapsFetched: string[] = []
  const errors: string[] = []
  const queue = [...candidateSitemapUrls]

  while (queue.length > 0 && sitemapsFetched.length < opts.maxSitemapFiles && urls.size < opts.maxUrls) {
    const sitemapUrl = queue.shift()!
    if (sitemapsFetched.includes(sitemapUrl)) continue
    const result = await fetchImpl(sitemapUrl, { timeoutMs: opts.timeoutMs, maxBytes: 5_000_000, accept: "application/xml,text/xml" })
    sitemapsFetched.push(sitemapUrl)
    if (!result.ok) {
      errors.push(`${sitemapUrl}: ${result.error ?? `HTTP ${result.status}`}`)
      continue
    }
    const locs = extractLocs(result.body)
    if (isSitemapIndex(result.body)) {
      for (const loc of locs) {
        if (!sitemapsFetched.includes(loc) && !queue.includes(loc)) queue.push(loc)
      }
    } else {
      for (const loc of locs) {
        if (urls.size >= opts.maxUrls) break
        urls.add(loc)
      }
    }
  }

  return { urls: [...urls], sitemapsFetched, errors }
}

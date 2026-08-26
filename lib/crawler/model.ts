/* ================================================================== *
 * CRAWLER — domain types. See migrations/0003_vertical_slice.sql,
 * docs/architecture/domain-model.md.
 * ================================================================== */

export interface CrawlLimits {
  maxPages: number
  maxDepth: number
  maxConcurrency: number
  requestTimeoutMs: number
  maxBytesPerResponse: number
}

/** Conservative defaults (§3) — a first discovery crawl proves the
 * mechanism, it does not attempt to index an entire site. */
export const DEFAULT_CRAWL_LIMITS: CrawlLimits = {
  maxPages: 25,
  maxDepth: 2,
  maxConcurrency: 3,
  requestTimeoutMs: 10_000,
  maxBytesPerResponse: 2_000_000,
}

export type CrawlStatus = "running" | "completed" | "failed"

export interface Crawl {
  id: string
  orgId: string
  projectId: string
  websiteId: string
  agentRunId: string | null
  status: CrawlStatus
  maxPages: number
  maxDepth: number
  pagesDiscovered: number
  pagesCrawled: number
  errorCount: number
  startedAt: number
  completedAt: number | null
}

export interface CrawlPage {
  id: string
  orgId: string
  projectId: string
  crawlId: string
  websiteId: string
  url: string
  canonicalUrl: string | null
  statusCode: number | null
  contentType: string | null
  title: string | null
  description: string | null
  language: string | null
  extractedText: string | null
  structuredData: unknown[] | null
  wordCount: number | null
  contentHash: string | null
  robotsAllowed: boolean
  indexable: boolean
  crawlDepth: number
  parentUrl: string | null
  error: string | null
  discoveredAt: number
  crawledAt: number | null
}

export interface CrawlLink {
  id: string
  orgId: string
  crawlId: string
  sourcePageId: string
  targetUrl: string
  anchorText: string | null
  rel: string | null
  isInternal: boolean
  createdAt: number
}

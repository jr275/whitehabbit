import "server-only"

/* ================================================================== *
 * CRAWLER — repository. Org/project-scoped throughout.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import type { Crawl, CrawlLink, CrawlPage, CrawlStatus } from "./model"

interface CrawlSqlRow {
  id: string
  org_id: string
  project_id: string
  website_id: string
  agent_run_id: string | null
  status: CrawlStatus
  max_pages: number
  max_depth: number
  pages_discovered: number
  pages_crawled: number
  error_count: number
  started_at: string
  completed_at: string | null
}

function rowToCrawl(r: CrawlSqlRow): Crawl {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    websiteId: r.website_id,
    agentRunId: r.agent_run_id,
    status: r.status,
    maxPages: r.max_pages,
    maxDepth: r.max_depth,
    pagesDiscovered: r.pages_discovered,
    pagesCrawled: r.pages_crawled,
    errorCount: r.error_count,
    startedAt: Number(r.started_at),
    completedAt: r.completed_at ? Number(r.completed_at) : null,
  }
}

export async function createCrawl(input: {
  orgId: string
  projectId: string
  websiteId: string
  agentRunId: string | null
  maxPages: number
  maxDepth: number
}): Promise<Crawl> {
  const id = `crawl_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO crawls (id, org_id, project_id, website_id, agent_run_id, status, max_pages, max_depth, started_at)
     VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8)`,
    [id, input.orgId, input.projectId, input.websiteId, input.agentRunId, input.maxPages, input.maxDepth, now],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    websiteId: input.websiteId,
    agentRunId: input.agentRunId,
    status: "running",
    maxPages: input.maxPages,
    maxDepth: input.maxDepth,
    pagesDiscovered: 0,
    pagesCrawled: 0,
    errorCount: 0,
    startedAt: now,
    completedAt: null,
  }
}

export async function finalizeCrawl(id: string, status: CrawlStatus, counts: { pagesDiscovered: number; pagesCrawled: number; errorCount: number }): Promise<void> {
  await query("UPDATE crawls SET status = $1, pages_discovered = $2, pages_crawled = $3, error_count = $4, completed_at = $5 WHERE id = $6", [
    status,
    counts.pagesDiscovered,
    counts.pagesCrawled,
    counts.errorCount,
    Date.now(),
    id,
  ])
}

export async function getCrawl(id: string, orgId: string): Promise<Crawl | null> {
  const row = await queryOne<CrawlSqlRow>("SELECT * FROM crawls WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToCrawl(row) : null
}

export async function getLatestCrawlForWebsite(websiteId: string, orgId: string): Promise<Crawl | null> {
  const row = await queryOne<CrawlSqlRow>("SELECT * FROM crawls WHERE website_id = $1 AND org_id = $2 ORDER BY started_at DESC LIMIT 1", [
    websiteId,
    orgId,
  ])
  return row ? rowToCrawl(row) : null
}

interface CrawlPageSqlRow {
  id: string
  org_id: string
  project_id: string
  crawl_id: string
  website_id: string
  url: string
  canonical_url: string | null
  status_code: number | null
  content_type: string | null
  title: string | null
  description: string | null
  language: string | null
  extracted_text: string | null
  structured_data: unknown[] | null
  word_count: number | null
  content_hash: string | null
  robots_allowed: boolean
  indexable: boolean
  crawl_depth: number
  parent_url: string | null
  error: string | null
  discovered_at: string
  crawled_at: string | null
}

function rowToPage(r: CrawlPageSqlRow): CrawlPage {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    crawlId: r.crawl_id,
    websiteId: r.website_id,
    url: r.url,
    canonicalUrl: r.canonical_url,
    statusCode: r.status_code,
    contentType: r.content_type,
    title: r.title,
    description: r.description,
    language: r.language,
    extractedText: r.extracted_text,
    structuredData: r.structured_data,
    wordCount: r.word_count,
    contentHash: r.content_hash,
    robotsAllowed: r.robots_allowed,
    indexable: r.indexable,
    crawlDepth: r.crawl_depth,
    parentUrl: r.parent_url,
    error: r.error,
    discoveredAt: Number(r.discovered_at),
    crawledAt: r.crawled_at ? Number(r.crawled_at) : null,
  }
}

export interface CreateCrawlPageInput {
  orgId: string
  projectId: string
  crawlId: string
  websiteId: string
  url: string
  crawlDepth: number
  parentUrl: string | null
}

export async function createDiscoveredPage(input: CreateCrawlPageInput): Promise<CrawlPage> {
  const id = `cpage_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO crawl_pages (id, org_id, project_id, crawl_id, website_id, url, robots_allowed, indexable, crawl_depth, parent_url, discovered_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, $7, $8, $9)`,
    [id, input.orgId, input.projectId, input.crawlId, input.websiteId, input.url, input.crawlDepth, input.parentUrl, now],
  )
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    crawlId: input.crawlId,
    websiteId: input.websiteId,
    url: input.url,
    canonicalUrl: null,
    statusCode: null,
    contentType: null,
    title: null,
    description: null,
    language: null,
    extractedText: null,
    structuredData: null,
    wordCount: null,
    contentHash: null,
    robotsAllowed: true,
    indexable: true,
    crawlDepth: input.crawlDepth,
    parentUrl: input.parentUrl,
    error: null,
    discoveredAt: now,
    crawledAt: null,
  }
}

export async function recordCrawlResult(
  id: string,
  patch: {
    canonicalUrl?: string | null
    statusCode: number | null
    contentType?: string | null
    title?: string | null
    description?: string | null
    language?: string | null
    extractedText?: string | null
    structuredData?: unknown[] | null
    wordCount?: number | null
    contentHash?: string | null
    robotsAllowed: boolean
    indexable: boolean
    error?: string | null
  },
): Promise<void> {
  await query(
    `UPDATE crawl_pages SET canonical_url = $1, status_code = $2, content_type = $3, title = $4, description = $5,
       language = $6, extracted_text = $7, structured_data = $8, word_count = $9, content_hash = $10, robots_allowed = $11,
       indexable = $12, error = $13, crawled_at = $14
     WHERE id = $15`,
    [
      patch.canonicalUrl ?? null,
      patch.statusCode,
      patch.contentType ?? null,
      patch.title ?? null,
      patch.description ?? null,
      patch.language ?? null,
      patch.extractedText ?? null,
      patch.structuredData ? JSON.stringify(patch.structuredData) : null,
      patch.wordCount ?? null,
      patch.contentHash ?? null,
      patch.robotsAllowed,
      patch.indexable,
      patch.error ?? null,
      Date.now(),
      id,
    ],
  )
}

export async function listPagesForCrawl(crawlId: string, orgId: string): Promise<CrawlPage[]> {
  const rows = await query<CrawlPageSqlRow>("SELECT * FROM crawl_pages WHERE crawl_id = $1 AND org_id = $2 ORDER BY discovered_at ASC", [
    crawlId,
    orgId,
  ])
  return rows.map(rowToPage)
}

export async function getPageByUrl(websiteId: string, crawlId: string, url: string): Promise<CrawlPage | null> {
  const row = await queryOne<CrawlPageSqlRow>("SELECT * FROM crawl_pages WHERE website_id = $1 AND crawl_id = $2 AND url = $3", [
    websiteId,
    crawlId,
    url,
  ])
  return row ? rowToPage(row) : null
}

export async function listLinksForSourcePage(sourcePageId: string, orgId: string): Promise<CrawlLink[]> {
  const rows = await query<{ id: string; org_id: string; crawl_id: string; source_page_id: string; target_url: string; anchor_text: string | null; rel: string | null; is_internal: boolean; created_at: string }>(
    "SELECT * FROM crawl_links WHERE source_page_id = $1 AND org_id = $2",
    [sourcePageId, orgId],
  )
  return rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    crawlId: r.crawl_id,
    sourcePageId: r.source_page_id,
    targetUrl: r.target_url,
    anchorText: r.anchor_text,
    rel: r.rel,
    isInternal: r.is_internal,
    createdAt: Number(r.created_at),
  }))
}

export async function createCrawlLink(input: {
  orgId: string
  crawlId: string
  sourcePageId: string
  targetUrl: string
  anchorText: string | null
  rel: string | null
  isInternal: boolean
}): Promise<CrawlLink> {
  const id = `clink_${randomUUID()}`
  const now = Date.now()
  await query(
    "INSERT INTO crawl_links (id, org_id, crawl_id, source_page_id, target_url, anchor_text, rel, is_internal, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [id, input.orgId, input.crawlId, input.sourcePageId, input.targetUrl, input.anchorText, input.rel, input.isInternal, now],
  )
  return { id, orgId: input.orgId, crawlId: input.crawlId, sourcePageId: input.sourcePageId, targetUrl: input.targetUrl, anchorText: input.anchorText, rel: input.rel, isInternal: input.isInternal, createdAt: now }
}

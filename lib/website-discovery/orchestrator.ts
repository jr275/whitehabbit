import "server-only"

/* ================================================================== *
 * WEBSITE DISCOVERY ORCHESTRATOR — the real §3 WebsiteDiscoveryAgent:
 * crawl -> knowledge profile -> entity extraction/resolution ->
 * opportunity discovery, as one durable agent_run (ADR-016). Every
 * step is persisted via lib/agent-runs/repo.ts's runStep() before
 * moving to the next; a failure anywhere finalizes the run and the
 * Website as "failed" with the real reason — never a silent partial
 * "success".
 *
 * Runs entirely in-process within one request (ADR-003/ADR-016: no
 * durable workflow engine yet) — heavy intermediate data (crawled page
 * text) stays in local variables between steps; only small, real
 * summaries are persisted as each step's `output` (agent_run_steps.output
 * is for inspection, not for resuming — see docs/adr/ADR-003).
 * ================================================================== */

import type { CrawlPage } from "@/lib/crawler/model"
import { createAgentRun, finalizeAgentRun, runStep } from "@/lib/agent-runs/repo"
import { runCrawl } from "@/lib/crawler/crawl"
import { DEFAULT_CRAWL_LIMITS, type CrawlLimits } from "@/lib/crawler/model"
import { listLinksForSourcePage } from "@/lib/crawler/repo"
import type { SafeFetchFn } from "@/lib/crawler/safe-fetch"
import { buildKnowledgeProfile } from "@/lib/knowledge-profile/builder"
import { createKnowledgeProfile } from "@/lib/knowledge-profile/repo"
import { runEntityExtraction, type EntityExtractionSummary } from "@/lib/knowledge/ingest-from-crawl"
import { discoverOpportunities } from "@/lib/opportunity/discovery"
import { updateDiscoveryStatus } from "@/lib/websites/repo"
import type { Website } from "@/lib/websites/model"

export interface WebsiteDiscoveryResult {
  agentRunId: string
  crawlId: string
  pagesCrawled: number
  entitiesCreated: number
  opportunitiesCreated: number
}

export async function runWebsiteDiscovery(
  website: Website,
  limits: CrawlLimits = DEFAULT_CRAWL_LIMITS,
  /** injectable only for tests — see lib/crawler/crawl.ts's runCrawl() */
  fetchPage?: SafeFetchFn,
): Promise<WebsiteDiscoveryResult> {
  const agentRun = await createAgentRun({
    orgId: website.orgId,
    projectId: website.projectId,
    pipeline: "website_discovery",
    subjectType: "website",
    subjectId: website.id,
  })

  try {
    await updateDiscoveryStatus(website.id, "discovering")

    let pages: CrawlPage[] = []
    let crawlId = ""
    let hasRobotsOrSitemap = false
    await runStep(website.orgId, agentRun.id, 1, "crawl", { startUrl: website.url }, async () => {
      const result = await runCrawl({
        orgId: website.orgId,
        projectId: website.projectId,
        websiteId: website.id,
        agentRunId: agentRun.id,
        startUrl: website.url,
        limits,
        fetchPage,
      })
      if (result.crawl.status === "failed") throw new Error("Crawl failed — no pages could be fetched from this website.")
      pages = result.pages
      crawlId = result.crawl.id
      hasRobotsOrSitemap = result.pages.some((p) => p.crawlDepth === 0)
      return { output: { crawlId, pagesDiscovered: result.crawl.pagesDiscovered, pagesCrawled: result.crawl.pagesCrawled, errorCount: result.crawl.errorCount } }
    })
    await updateDiscoveryStatus(website.id, "crawled")

    await updateDiscoveryStatus(website.id, "analyzing")

    let extraction: EntityExtractionSummary | null = null
    await runStep(website.orgId, agentRun.id, 2, "extract_entities", { pagesCrawled: pages.filter((p) => p.crawledAt).length }, async () => {
      extraction = await runEntityExtraction(website.orgId, website.projectId, pages)
      return {
        output: {
          created: extraction.createdCount,
          exactMatch: extraction.exactMatchCount,
          autoMerged: extraction.autoMergedCount,
          reviewCandidates: extraction.reviewCandidateCount,
          relationshipsCreated: extraction.relationshipsCreated,
        },
      }
    })
    const extractionSummary = extraction!

    const homepage = pages[0]
    const homepageLinks = homepage ? await listLinksForSourcePage(homepage.id, website.orgId) : []

    await runStep(website.orgId, agentRun.id, 3, "build_profile", null, async () => {
      const { profile, confidence } = buildKnowledgeProfile({
        hostname: website.hostname,
        pages,
        entityCandidates: extractionSummary.persistedCandidates,
        hasRobotsTxt: hasRobotsOrSitemap,
        hasSitemap: hasRobotsOrSitemap,
        homepageAnchorTexts: homepageLinks.filter((l) => l.isInternal).map((l) => l.anchorText ?? ""),
      })
      await createKnowledgeProfile({ orgId: website.orgId, projectId: website.projectId, websiteId: website.id, sourceCrawlId: crawlId, profile, confidence })
      return { output: { detectedVertical: profile.detectedVertical, entityTypeCount: profile.primaryEntityTypes.length } }
    })

    let opportunitiesCreated = 0
    await runStep(website.orgId, agentRun.id, 4, "discover_opportunities", null, async () => {
      const opportunities = await discoverOpportunities({ orgId: website.orgId, projectId: website.projectId, websiteId: website.id, agentRunId: agentRun.id })
      opportunitiesCreated = opportunities.length
      return { output: { opportunitiesCreated: opportunities.length } }
    })

    await finalizeAgentRun(agentRun.id, { status: "completed" })
    await updateDiscoveryStatus(website.id, "ready")

    return {
      agentRunId: agentRun.id,
      crawlId,
      pagesCrawled: pages.filter((p) => p.crawledAt).length,
      entitiesCreated: extractionSummary.createdCount,
      opportunitiesCreated,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Website discovery failed for an unknown reason."
    await finalizeAgentRun(agentRun.id, { status: "failed", errorReason: message })
    await updateDiscoveryStatus(website.id, "failed", message)
    throw err
  }
}

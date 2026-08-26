import "server-only"

/* ================================================================== *
 * WEBSITE DISCOVERY ORCHESTRATOR — the real §3 WebsiteDiscoveryAgent:
 * crawl -> knowledge profile -> entity extraction/resolution ->
 * opportunity discovery, as one durable, checkpointed, resumable
 * WorkflowRun (ADR-016, ADR-017 — Phase 4).
 *
 * workflowEngine.start() is idempotent: calling this again for the
 * same website while a previous attempt is still active (not yet
 * succeeded/failed/cancelled) returns THAT SAME run, and runStep()
 * skips every already-succeeded step, resuming from the real
 * checkpoint instead of re-crawling or re-extracting from scratch.
 *
 * Design rule that makes resume actually correct: NEVER rely on a
 * step closure's outer-scope side effects to carry state to a later
 * step. A resumed step's closure never runs at all (runStep returns
 * its cached output instead) — so every later step re-derives what it
 * needs either from the real, already-persisted database rows, or
 * from the small `output`/`checkpointData` runStep() actually returns
 * (which is correct in both the fresh and the resumed case, because
 * that value is exactly what completeStep() persisted after the
 * closure's writes had already fully landed, whichever attempt did it).
 *
 * This function is the LegacySyncExecutionAdapter (§40): it still runs
 * entirely in-process within one request/call — the exact same shape
 * as Phase 3 — but every step now goes through the same checkpointed,
 * retried, budget-checked runStep() the queue-driven path
 * (lib/workflow/worker.ts) also uses, so both paths share one real
 * durability implementation.
 * ================================================================== */

import { runCrawl } from "@/lib/crawler/crawl"
import { DEFAULT_CRAWL_LIMITS, type CrawlLimits } from "@/lib/crawler/model"
import { listLinksForSourcePage, listPagesForCrawl } from "@/lib/crawler/repo"
import type { SafeFetchFn } from "@/lib/crawler/safe-fetch"
import { buildKnowledgeProfile } from "@/lib/knowledge-profile/builder"
import { createKnowledgeProfile } from "@/lib/knowledge-profile/repo"
import { listCanonicalEntities } from "@/lib/knowledge/repo"
import { runEntityExtraction } from "@/lib/knowledge/ingest-from-crawl"
import { discoverOpportunities } from "@/lib/opportunity/discovery"
import { assertCapability } from "@/lib/workflow/permissions"
import { finalizeWorkflow, runStep, workflowEngine } from "@/lib/workflow/engine"
import type { WorkflowRun } from "@/lib/workflow/types"
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
  assertCapability("WebsiteDiscoveryAgent", "crawl_website")

  const run: WorkflowRun = await workflowEngine.start({
    orgId: website.orgId,
    projectId: website.projectId,
    pipeline: "website_discovery",
    subjectType: "website",
    subjectId: website.id,
  })

  try {
    await updateDiscoveryStatus(website.id, "discovering")

    const crawlResult = await runStep(run, 1, "crawl", { startUrl: website.url }, async () => {
      const result = await runCrawl({
        orgId: website.orgId,
        projectId: website.projectId,
        websiteId: website.id,
        agentRunId: run.id,
        startUrl: website.url,
        limits,
        fetchPage,
      })
      if (result.crawl.status === "failed") throw new Error("Crawl failed — no pages could be fetched from this website.")
      return { output: { crawlId: result.crawl.id, pagesDiscovered: result.crawl.pagesDiscovered, pagesCrawled: result.crawl.pagesCrawled, errorCount: result.crawl.errorCount } }
    })
    const crawlId = crawlResult.output.crawlId as string
    // real, from the database, whether this step just ran or was resumed
    const pages = await listPagesForCrawl(crawlId, website.orgId)
    const hasRobotsOrSitemap = pages.some((p) => p.crawlDepth === 0)
    await updateDiscoveryStatus(website.id, "crawled")
    await updateDiscoveryStatus(website.id, "analyzing")

    assertCapability("WebsiteDiscoveryAgent", "extract_entities")
    const extractionResult = await runStep(run, 2, "extract_entities", { pagesCrawled: pages.filter((p) => p.crawledAt).length }, async () => {
      const summary = await runEntityExtraction(website.orgId, website.projectId, pages)
      return {
        output: {
          created: summary.createdCount,
          exactMatch: summary.exactMatchCount,
          autoMerged: summary.autoMergedCount,
          reviewCandidates: summary.reviewCandidateCount,
          relationshipsCreated: summary.relationshipsCreated,
        },
      }
    })

    const homepage = pages[0]
    const homepageLinks = homepage ? await listLinksForSourcePage(homepage.id, website.orgId) : []

    await runStep(run, 3, "build_profile", null, async () => {
      // real, from the database — correct whether extraction just ran or
      // was resumed from an earlier attempt.
      const canonicalEntities = (await listCanonicalEntities(website.orgId, website.projectId, { limit: 500 })).map((e) => ({ type: e.entityType, name: e.name, confidence: 0.7 }))
      const { profile, confidence } = buildKnowledgeProfile({
        hostname: website.hostname,
        pages,
        entityCandidates: canonicalEntities,
        hasRobotsTxt: hasRobotsOrSitemap,
        hasSitemap: hasRobotsOrSitemap,
        homepageAnchorTexts: homepageLinks.filter((l) => l.isInternal).map((l) => l.anchorText ?? ""),
      })
      await createKnowledgeProfile({ orgId: website.orgId, projectId: website.projectId, websiteId: website.id, sourceCrawlId: crawlId, profile, confidence })
      return { output: { detectedVertical: profile.detectedVertical, entityTypeCount: profile.primaryEntityTypes.length } }
    })

    assertCapability("WebsiteDiscoveryAgent", "write_opportunity")
    const opportunityStep = await runStep(run, 4, "discover_opportunities", null, async () => {
      const opportunities = await discoverOpportunities({ orgId: website.orgId, projectId: website.projectId, websiteId: website.id, agentRunId: run.id })
      return { output: { opportunitiesCreated: opportunities.length } }
    })

    await finalizeWorkflow(run.id, run.orgId, "succeeded")
    await updateDiscoveryStatus(website.id, "ready")

    return {
      agentRunId: run.id,
      crawlId,
      pagesCrawled: pages.filter((p) => p.crawledAt).length,
      entitiesCreated: extractionResult.output.created as number,
      opportunitiesCreated: opportunityStep.output.opportunitiesCreated as number,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Website discovery failed for an unknown reason."
    await finalizeWorkflow(run.id, run.orgId, "failed", { errorReason: message }).catch(() => {
      // the run may already be terminal — the website's own failed
      // status below is what matters to the caller either way.
    })
    await updateDiscoveryStatus(website.id, "failed", message)
    throw err
  }
}

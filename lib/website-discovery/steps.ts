import "server-only"

/* ================================================================== *
 * WEBSITE DISCOVERY — STEP DISPATCH (Phase 5A, ADR-023). The single
 * source of truth for what each named step does. Each function here
 * executes EXACTLY ONE step and returns what should happen next — it
 * never calls another step directly. Two callers share this module:
 *
 *   - lib/workflow/step-worker.ts (the real, queue-driven path: one
 *     step per job, crash-recoverable between any two steps).
 *   - lib/website-discovery/orchestrator.ts's runWebsiteDiscovery(),
 *     the LegacySyncExecutionAdapter — a thin loop that calls
 *     dispatchWebsiteDiscoveryStep() repeatedly in-process until
 *     terminal, for tests/internal callers that want a synchronous
 *     result. Both share the exact same step logic — no duplication.
 *
 * Design rule unchanged from Phase 4: a step never reads another step's
 * in-memory closure. It re-derives whatever it needs from the database
 * (repo.getStep()'s persisted output, or a real repository query) —
 * correct whether this is the first attempt or a resumed one running in
 * a completely different process.
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
import { runStep } from "@/lib/workflow/engine"
import * as workflowRepo from "@/lib/workflow/repo"
import type { WorkflowRun } from "@/lib/workflow/types"
import { updateDiscoveryStatus } from "@/lib/websites/repo"
import type { Website } from "@/lib/websites/model"
import type { StepOutcome } from "@/lib/workflow/step-types"

export const WEBSITE_DISCOVERY_STEPS = ["crawl", "extract_entities", "build_profile", "discover_opportunities"] as const
export type WebsiteDiscoveryStepName = (typeof WEBSITE_DISCOVERY_STEPS)[number]

export function websiteDiscoveryStepSequence(step: string): number {
  const idx = WEBSITE_DISCOVERY_STEPS.indexOf(step as WebsiteDiscoveryStepName)
  if (idx === -1) throw new Error(`Unknown website_discovery step: ${step}`)
  return idx + 1
}

export interface DispatchOptions {
  limits?: CrawlLimits
  /** injectable only for tests — see lib/crawler/crawl.ts's runCrawl() */
  fetchPage?: SafeFetchFn
}

/** Executes exactly one named step for this run. Throws on a real,
 * unrecoverable failure (the caller — step-worker or the legacy
 * adapter — decides how to translate that into a job retry/dead-letter
 * or a terminal workflow failure). Returns an outcome describing what
 * to do next; never advances more than one step itself. */
export async function dispatchWebsiteDiscoveryStep(run: WorkflowRun, website: Website, stepName: string, opts: DispatchOptions = {}): Promise<StepOutcome> {
  switch (stepName as WebsiteDiscoveryStepName) {
    case "crawl": {
      await updateDiscoveryStatus(website.id, "discovering")
      await runStep(run, 1, "crawl", { startUrl: website.url }, async () => {
        const result = await runCrawl({
          orgId: website.orgId,
          projectId: website.projectId,
          websiteId: website.id,
          agentRunId: run.id,
          startUrl: website.url,
          limits: opts.limits ?? DEFAULT_CRAWL_LIMITS,
          fetchPage: opts.fetchPage,
        })
        if (result.crawl.status === "failed") throw new Error("Crawl failed — no pages could be fetched from this website.")
        return { output: { crawlId: result.crawl.id, pagesDiscovered: result.crawl.pagesDiscovered, pagesCrawled: result.crawl.pagesCrawled, errorCount: result.crawl.errorCount } }
      })
      await updateDiscoveryStatus(website.id, "crawled")
      return { kind: "advance", nextStep: "extract_entities" }
    }

    case "extract_entities": {
      await updateDiscoveryStatus(website.id, "analyzing")
      assertCapability("WebsiteDiscoveryAgent", "extract_entities")
      // real, from the database, whether "crawl" just ran in this same
      // process or in an earlier one entirely.
      const crawlStep = await workflowRepo.getStep(run.id, "crawl", 1, run.orgId)
      const crawlId = crawlStep?.output?.crawlId as string | undefined
      if (!crawlId) throw new Error("extract_entities dispatched before crawl completed — no crawlId on record.")
      const pages = await listPagesForCrawl(crawlId, website.orgId)
      await runStep(run, 2, "extract_entities", { pagesCrawled: pages.filter((p) => p.crawledAt).length }, async () => {
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
      return { kind: "advance", nextStep: "build_profile" }
    }

    case "build_profile": {
      await runStep(run, 3, "build_profile", null, async () => {
        const crawlStep = await workflowRepo.getStep(run.id, "crawl", 1, run.orgId)
        const crawlId = crawlStep?.output?.crawlId as string | undefined
        if (!crawlId) throw new Error("build_profile dispatched before crawl completed — no crawlId on record.")
        const pages = await listPagesForCrawl(crawlId, website.orgId)
        const hasRobotsOrSitemap = pages.some((p) => p.crawlDepth === 0)
        const homepage = pages[0]
        const homepageLinks = homepage ? await listLinksForSourcePage(homepage.id, website.orgId) : []
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
      return { kind: "advance", nextStep: "discover_opportunities" }
    }

    case "discover_opportunities": {
      assertCapability("WebsiteDiscoveryAgent", "write_opportunity")
      await runStep(run, 4, "discover_opportunities", null, async () => {
        const opportunities = await discoverOpportunities({ orgId: website.orgId, projectId: website.projectId, websiteId: website.id, agentRunId: run.id })
        return { output: { opportunitiesCreated: opportunities.length } }
      })
      await updateDiscoveryStatus(website.id, "ready")
      return { kind: "terminal", status: "succeeded" }
    }

    default:
      throw new Error(`Unknown website_discovery step: ${stepName}`)
  }
}

/** The step immediately after the run's last real checkpoint — used by
 * resume/retry to enqueue exactly the right next step rather than
 * restarting from "crawl". Returns null if the pipeline's last step has
 * already completed (nothing left to advance — the caller should not
 * be resuming a run in this state). */
export function nextWebsiteDiscoveryStep(lastCompletedSequence: number | null): string | null {
  const nextSeq = (lastCompletedSequence ?? 0) + 1
  if (nextSeq > WEBSITE_DISCOVERY_STEPS.length) return null
  return WEBSITE_DISCOVERY_STEPS[nextSeq - 1]
}

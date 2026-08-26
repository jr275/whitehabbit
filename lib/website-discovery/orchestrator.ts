import "server-only"

/* ================================================================== *
 * WEBSITE DISCOVERY — LegacySyncExecutionAdapter (Phase 5A, ADR-023).
 *
 * This function is NOT the primary execution path anymore. The real
 * path (used by every HTTP entry point — see app/api/projects/[id]/
 * websites/[id]/discover/route.ts) enqueues one step job
 * (lib/workflow/step-worker.ts#enqueueStepJob) and returns immediately;
 * a worker tick executes exactly one step per job, persists, and
 * enqueues the next. No HTTP request runs this whole function anymore.
 *
 * runWebsiteDiscovery() still exists because tests and internal/admin
 * callers sometimes want "run this to completion and give me the
 * result" without touching the queue at all — it drives the exact same
 * step-dispatch functions (lib/website-discovery/steps.ts) in a plain
 * in-process loop, so there is zero duplicated step logic between the
 * two paths; this is a thin driver, not a second implementation.
 * ================================================================== */

import { DEFAULT_CRAWL_LIMITS, type CrawlLimits } from "@/lib/crawler/model"
import type { SafeFetchFn } from "@/lib/crawler/safe-fetch"
import { assertCapability } from "@/lib/workflow/permissions"
import { finalizeWorkflow, workflowEngine } from "@/lib/workflow/engine"
import * as workflowRepo from "@/lib/workflow/repo"
import type { WorkflowRun } from "@/lib/workflow/types"
import { updateDiscoveryStatus } from "@/lib/websites/repo"
import type { Website } from "@/lib/websites/model"
import { dispatchWebsiteDiscoveryStep, nextWebsiteDiscoveryStep } from "./steps"

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
    let current = nextWebsiteDiscoveryStep(run.checkpoint?.lastCompletedSequence ?? null)
    while (current) {
      const freshRun = (await workflowRepo.getWorkflowRun(run.id, run.orgId))!
      const outcome = await dispatchWebsiteDiscoveryStep(freshRun, website, current, { limits, fetchPage })
      if (outcome.kind !== "advance") {
        if (outcome.kind === "terminal" && outcome.status === "succeeded") {
          await finalizeWorkflow(run.id, run.orgId, "succeeded")
        } else {
          const reason = outcome.kind === "terminal" ? (outcome.errorReason ?? "Website discovery failed.") : "Website discovery paused unexpectedly."
          throw new Error(reason)
        }
        break
      }
      current = outcome.nextStep
    }

    return await buildResult(run.id, run.orgId)
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

async function buildResult(runId: string, orgId: string): Promise<WebsiteDiscoveryResult> {
  const [crawlStep, extractStep, discoverStep] = await Promise.all([
    workflowRepo.getStep(runId, "crawl", 1, orgId),
    workflowRepo.getStep(runId, "extract_entities", 2, orgId),
    workflowRepo.getStep(runId, "discover_opportunities", 4, orgId),
  ])
  return {
    agentRunId: runId,
    crawlId: (crawlStep?.output?.crawlId as string) ?? "",
    pagesCrawled: (crawlStep?.output?.pagesCrawled as number) ?? 0,
    entitiesCreated: (extractStep?.output?.created as number) ?? 0,
    opportunitiesCreated: (discoverStep?.output?.opportunitiesCreated as number) ?? 0,
  }
}

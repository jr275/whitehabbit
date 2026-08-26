import "server-only"

/* POST /api/projects/:projectId/websites/:websiteId/discover — starts
 * the real WebsiteDiscoveryAgent (§3) as a durable WorkflowRun.
 *
 * Phase 5A (ADR-023): this request NEVER runs the pipeline itself. It
 * starts (or idempotently reattaches to) the WorkflowRun, enqueues
 * exactly the first step job, and returns immediately — the crawl,
 * entity extraction, knowledge profile, and opportunity discovery each
 * run as their own durable, retryable, crash-recoverable step job,
 * drained by the worker tick (POST /api/v1/workflows/process). Poll
 * GET /api/v1/workflows/:id (or its SSE /events stream) for progress. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { getWebsite } from "@/lib/websites/repo"
import { assertCapability } from "@/lib/workflow/permissions"
import { workflowEngine } from "@/lib/workflow/engine"
import { enqueueStepJob } from "@/lib/workflow/step-worker"
import { nextWebsiteDiscoveryStep } from "@/lib/website-discovery/steps"

type Params = { params: Promise<{ projectId: string; websiteId: string }> }

const IN_PROGRESS_STATUSES = new Set(["discovering", "discovered", "crawling", "crawled", "analyzing"])

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("websites.discover", async () => {
    const { organizationId, userId } = await requireSession()
    const { websiteId } = await params
    await enforceRateLimit("website_discover", organizationId)

    const website = await getWebsite(websiteId, organizationId)
    if (!website) throw new NotFoundError()
    if (IN_PROGRESS_STATUSES.has(website.discoveryStatus)) {
      throw new ValidationError(`Discovery is already running for this website (status: ${website.discoveryStatus}).`)
    }

    assertCapability("WebsiteDiscoveryAgent", "crawl_website")
    // idempotent: reattaches to an already-active run for this website
    // rather than starting a second one (§6).
    const run = await workflowEngine.start({
      orgId: website.orgId,
      projectId: website.projectId,
      pipeline: "website_discovery",
      subjectType: "website",
      subjectId: website.id,
    })
    const nextStep = nextWebsiteDiscoveryStep(run.checkpoint?.lastCompletedSequence ?? null)
    if (nextStep) await enqueueStepJob(run, nextStep)

    await recordAudit({ orgId: organizationId, userId, action: "website.discover", resourceType: "website", resourceId: website.id })
    return NextResponse.json({ workflow: run }, { status: 202 })
  })
}

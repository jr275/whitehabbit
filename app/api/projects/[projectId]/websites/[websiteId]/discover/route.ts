import "server-only"

/* POST /api/projects/:projectId/websites/:websiteId/discover — runs
 * the real WebsiteDiscoveryAgent (§3): a bounded, SSRF-safe crawl,
 * entity extraction/resolution, knowledge profile, and opportunity
 * discovery, as one durable agent_run.
 *
 * Runs synchronously within this request — there is no background
 * worker/queue yet (ADR-003). Bounded by DEFAULT_CRAWL_LIMITS
 * specifically so this stays within a reasonable request lifetime;
 * moving this to a real background job is the named next step once
 * a durable workflow engine exists (docs/architecture/roadmap.md
 * Phase 4). A website already mid-discovery is rejected rather than
 * started twice (§36 idempotency). */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { getWebsite } from "@/lib/websites/repo"
import { runWebsiteDiscovery } from "@/lib/website-discovery/orchestrator"

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

    await recordAudit({ orgId: organizationId, userId, action: "website.discover", resourceType: "website", resourceId: website.id })
    const result = await runWebsiteDiscovery(website)
    return NextResponse.json({ result })
  })
}

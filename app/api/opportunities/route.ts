import "server-only"

/* GET /api/opportunities — the authenticated org's real, persisted
 * Opportunity rows for its default Project (docs/architecture/
 * risks.md R-12: real multi-project selection is a Phase 3 UI, not
 * built here). Optional ?status= filter, one of the real
 * OpportunityStatus values.
 *
 * These rows are produced by lib/opportunity/ingest.ts, called from
 * lib/agent/runtime.ts after a real skill_seo_opportunity execution —
 * nothing here fabricates an opportunity; this route only reads what
 * was actually persisted. Every score field is `null` unless a real
 * computation backs it (docs/adr/ADR-005/ADR-006) — this route passes
 * that through unmodified. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listOpportunities } from "@/lib/opportunity/repo"
import type { OpportunityStatus } from "@/lib/opportunity/model"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: OpportunityStatus[] = ["discovered", "qualified", "approved", "rejected", "generating", "published", "monitoring", "stale", "merged"]

export async function GET(req: Request) {
  return withApiHandler("opportunities.list", async () => {
    const { organizationId } = await requireSession()
    const project = await getOrCreateDefaultProject(organizationId)

    const statusParam = new URL(req.url).searchParams.get("status")
    const status = statusParam && VALID_STATUSES.includes(statusParam as OpportunityStatus) ? (statusParam as OpportunityStatus) : undefined

    const opportunities = await listOpportunities(organizationId, project.id, { status })
    return NextResponse.json({ opportunities, projectId: project.id })
  })
}

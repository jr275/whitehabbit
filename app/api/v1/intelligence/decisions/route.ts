import "server-only"

/* GET /api/v1/intelligence/decisions — real, explainable Decisions
 * (§4, §19). POST runs the real Decision Engine scan over this
 * project's active Observations — never fabricates a decision, and is
 * idempotent (lib/intelligence/decision-scan.ts never double-decides
 * the same Observation). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { listDecisions, type DecisionStatus } from "@/lib/intelligence/decisions"
import { runDecisionScan } from "@/lib/intelligence/decision-scan"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: DecisionStatus[] = ["pending", "approved", "rejected", "executed", "expired", "cancelled"]

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.decisions.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const statusParam = url.searchParams.get("status")
    const status = statusParam && VALID_STATUSES.includes(statusParam as DecisionStatus) ? (statusParam as DecisionStatus) : undefined
    const decisions = await listDecisions(organizationId, projectId, { status })
    return NextResponse.json({ decisions })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.intelligence.decisions.scan", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const created = await runDecisionScan(organizationId, body.projectId)
    await recordAudit({ orgId: organizationId, userId, action: "decisions.scan", resourceType: "project", resourceId: body.projectId, metadata: { created: created.length } })
    return NextResponse.json({ decisions: created }, { status: 201 })
  })
}

import "server-only"

/* GET/POST /api/v1/intelligence/outcomes — real, measured results of a
 * real Action (§13, §19). POST is the real measurement-ingestion path
 * (e.g. a Search Console/AI Visibility delta measured after a page
 * publishes) — delta is always computed server-side from baseline vs.
 * value, never accepted as a client-supplied number. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { getAction } from "@/lib/intelligence/actions"
import { listOutcomes, listOutcomesForAction, recordOutcome } from "@/lib/intelligence/outcomes"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.outcomes.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const actionId = url.searchParams.get("actionId")
    if (actionId) {
      const outcomes = await listOutcomesForAction(organizationId, actionId)
      return NextResponse.json({ outcomes })
    }
    const outcomes = await listOutcomes(organizationId, projectId)
    return NextResponse.json({ outcomes })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.intelligence.outcomes.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string; actionId?: string; metric?: string; baseline?: number; value?: number; confidence?: number; evidence?: string[]; measuredAt?: number }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.actionId) throw new ValidationError("actionId is required.")
    if (!body.metric) throw new ValidationError("metric is required.")
    if (body.value == null) throw new ValidationError("value is required.")
    if (body.confidence == null || body.confidence < 0 || body.confidence > 1) throw new ValidationError("confidence must be between 0 and 1.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const action = await getAction(body.actionId, organizationId)
    if (!action) throw new ValidationError("Action not found.")

    const outcome = await recordOutcome({ orgId: organizationId, projectId: body.projectId, actionId: body.actionId, metric: body.metric, baseline: body.baseline ?? null, value: body.value, confidence: body.confidence, evidence: body.evidence, measuredAt: body.measuredAt })
    await recordAudit({ orgId: organizationId, userId, action: "outcome.create", resourceType: "intelligence_outcome", resourceId: outcome.id })
    return NextResponse.json({ outcome }, { status: 201 })
  })
}

import "server-only"

/* GET/POST /api/v1/intelligence/insights — real, tenant-scoped Insight
 * records (§9, §19). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { createInsight, listInsights } from "@/lib/intelligence/insights"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.intelligence.insights.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const insights = await listInsights(organizationId, projectId)
    return NextResponse.json({ insights })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.intelligence.insights.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string; title?: string; summary?: string; category?: string; confidence?: number; signalIds?: string[] }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.title || !body.summary || !body.category) throw new ValidationError("title, summary, and category are required.")
    if (body.confidence == null || body.confidence < 0 || body.confidence > 1) throw new ValidationError("confidence must be between 0 and 1.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const insight = await createInsight({ orgId: organizationId, projectId: body.projectId, title: body.title, summary: body.summary, category: body.category, confidence: body.confidence, signalIds: body.signalIds ?? [] })
    await recordAudit({ orgId: organizationId, userId, action: "insight.create", resourceType: "insight", resourceId: insight.id })
    return NextResponse.json({ insight }, { status: 201 })
  })
}

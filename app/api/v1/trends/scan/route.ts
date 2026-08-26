import "server-only"

/* POST /api/v1/trends/scan — runs the real deterministic trend
 * detector over this project's real Search Console data (§15-16). A
 * project with no Search Console data yet returns zero trends —
 * never a fabricated one. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { runTrendScan } from "@/lib/intelligence/trend-scan"
import { requireSession } from "@/lib/session"

export async function POST(req: Request) {
  return withApiHandler("v1.trends.scan", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json().catch(() => ({}))) as { projectId?: string }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const result = await runTrendScan(organizationId, body.projectId)
    await recordAudit({ orgId: organizationId, userId, action: "trends.scan", resourceType: "project", resourceId: body.projectId, metadata: { ...result } })
    return NextResponse.json(result)
  })
}

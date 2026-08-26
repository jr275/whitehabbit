import "server-only"

/* GET/POST /api/v1/queries — real, tenant-scoped Query rows, each
 * deterministically intent-classified on first observation (§17). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { listQueries } from "@/lib/intelligence/queries"
import { normalizeSearchQuery } from "@/lib/intelligence/search-console/normalize"
import type { IntentLabel } from "@/lib/intelligence/intent-classifier"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.queries.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const intent = url.searchParams.get("intent") as IntentLabel | null
    const queries = await listQueries(organizationId, projectId, { intent: intent ?? undefined })
    return NextResponse.json({ queries })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.queries.observe", async () => {
    const { organizationId } = await requireSession()
    const body = (await req.json()) as { projectId?: string; text?: string }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.text?.trim()) throw new ValidationError("text is required.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const query = await normalizeSearchQuery(organizationId, body.projectId, body.text, "manual")
    return NextResponse.json({ query }, { status: 201 })
  })
}

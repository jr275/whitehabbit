import "server-only"

/* GET/POST /api/v1/search-console/properties — real, tenant-scoped
 * Search Console properties (§12). Registering a property here does
 * NOT verify it — `verified` starts false and is set only by a real
 * check (out of scope for this revision's minimal surface; today set
 * via the manual-import path's own good-faith flag). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { createProperty, listProperties } from "@/lib/intelligence/search-console/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.search-console.properties.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const properties = await listProperties(organizationId, projectId)
    return NextResponse.json({ properties })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.search-console.properties.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string; siteUrl?: string }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.siteUrl?.trim()) throw new ValidationError("siteUrl is required.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const property = await createProperty({ orgId: organizationId, projectId: body.projectId, siteUrl: body.siteUrl })
    await recordAudit({ orgId: organizationId, userId, action: "search_console_property.create", resourceType: "search_console_property", resourceId: property.id })
    return NextResponse.json({ property }, { status: 201 })
  })
}

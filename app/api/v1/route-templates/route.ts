import "server-only"

/* GET/POST /api/v1/route-templates — CRUD for the RouteTemplate
 * registry (§19). Created in 'draft' status; activate via a follow-up
 * PATCH-style status update is intentionally out of scope for this
 * revision's minimal surface — templates are activated directly
 * (status handling lives in lib/route-templates/repo.ts for the next
 * increment to wire a real /activate route onto). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { createRouteTemplate, listRouteTemplates } from "@/lib/route-templates/repo"
import type { RouteTemplateBinding } from "@/lib/route-templates/model"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.route-templates.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const templates = await listRouteTemplates(organizationId, projectId)
    return NextResponse.json({ routeTemplates: templates })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.route-templates.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as {
      projectId?: string
      name?: string
      pattern?: string
      entityBindings?: RouteTemplateBinding[]
      intentBindings?: string[]
      marketBindings?: string[]
      requirements?: string[]
      priority?: number
    }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.name?.trim()) throw new ValidationError("name is required.")
    if (!body.pattern?.trim() || !body.pattern.startsWith("/")) throw new ValidationError("pattern is required and must start with /.")

    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const template = await createRouteTemplate({
      orgId: organizationId,
      projectId: body.projectId,
      name: body.name,
      pattern: body.pattern,
      entityBindings: body.entityBindings,
      intentBindings: body.intentBindings,
      marketBindings: body.marketBindings,
      requirements: body.requirements,
      priority: body.priority,
    })
    await recordAudit({ orgId: organizationId, userId, action: "route_template.create", resourceType: "route_template", resourceId: template.id })
    return NextResponse.json({ routeTemplate: template }, { status: 201 })
  })
}

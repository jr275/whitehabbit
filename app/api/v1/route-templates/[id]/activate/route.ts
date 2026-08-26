import "server-only"

/* POST /api/v1/route-templates/:id/activate — moves a draft template
 * to 'active' so new pages can be classified against it (§19). */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getRouteTemplate, setRouteTemplateStatus } from "@/lib/route-templates/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.route-templates.activate", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await getRouteTemplate(id, organizationId)
    if (!existing) throw new NotFoundError()
    await setRouteTemplateStatus(id, organizationId, "active")
    await recordAudit({ orgId: organizationId, userId, action: "route_template.activate", resourceType: "route_template", resourceId: id })
    const updated = await getRouteTemplate(id, organizationId)
    return NextResponse.json({ routeTemplate: updated })
  })
}

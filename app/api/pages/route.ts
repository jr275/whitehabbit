import "server-only"

/* GET /api/pages — the authenticated org's real, persisted Pages for
 * its default Project. Optional ?status= filter. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import type { PageStatus } from "@/lib/pages/model"
import { listPages } from "@/lib/pages/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: PageStatus[] = ["draft", "quality_rejected", "ready", "published"]

export async function GET(req: Request) {
  return withApiHandler("pages.list", async () => {
    const { organizationId } = await requireSession()
    const project = await getOrCreateDefaultProject(organizationId)
    const statusParam = new URL(req.url).searchParams.get("status")
    const status = statusParam && VALID_STATUSES.includes(statusParam as PageStatus) ? (statusParam as PageStatus) : undefined
    const pages = await listPages(organizationId, project.id, { status })
    return NextResponse.json({ pages })
  })
}

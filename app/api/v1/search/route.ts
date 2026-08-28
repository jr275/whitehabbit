import "server-only"

/* GET /api/v1/search — the real, tenant-scoped backend for the Command
 * Palette's global search (Phase 8 §20-21). `q` is required and must
 * be at least 2 characters — a shorter/blank query returns an empty
 * result rather than scanning every table. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { getProject } from "@/lib/projects/repo"
import { globalSearch } from "@/lib/search"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.search", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const q = url.searchParams.get("q") ?? ""
    const projectIdParam = url.searchParams.get("projectId")
    // A cross-tenant projectId is silently treated as "no project" —
    // this endpoint degrades to org-only results rather than leaking
    // whether another tenant's project id exists.
    const projectId = projectIdParam && (await getProject(projectIdParam, organizationId)) ? projectIdParam : null

    const results = await globalSearch(organizationId, projectId, q)
    return NextResponse.json({ results })
  })
}

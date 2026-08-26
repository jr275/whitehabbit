import "server-only"

/* GET /api/pages/:id — one real Page plus its latest content version,
 * generated internal link recommendations, and content-pipeline
 * artifacts (Research/Outline/Draft/SEO/GEO/Quality) — never exposing
 * any secret (there is none in these artifacts to begin with). */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { listArtifactsForBrief } from "@/lib/content-pipeline/repo"
import { listInternalLinksForPage } from "@/lib/internal-links/repo"
import { getLatestVersion, getPage } from "@/lib/pages/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("pages.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const page = await getPage(id, organizationId)
    if (!page) throw new NotFoundError()
    const [version, internalLinks, artifacts] = await Promise.all([
      getLatestVersion(id, organizationId),
      listInternalLinksForPage(id, organizationId),
      listArtifactsForBrief(page.pageBriefId, organizationId),
    ])
    return NextResponse.json({ page, version, internalLinks, artifacts })
  })
}

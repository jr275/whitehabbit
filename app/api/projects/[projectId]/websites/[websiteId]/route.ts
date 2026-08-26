import "server-only"

/* GET /api/projects/:projectId/websites/:websiteId — one real Website,
 * plus its latest WebsiteKnowledgeProfile if discovery has produced
 * one yet. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getLatestKnowledgeProfile } from "@/lib/knowledge-profile/repo"
import { requireSession } from "@/lib/session"
import { getWebsite } from "@/lib/websites/repo"

type Params = { params: Promise<{ projectId: string; websiteId: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("websites.get", async () => {
    const { organizationId } = await requireSession()
    const { websiteId } = await params
    const website = await getWebsite(websiteId, organizationId)
    if (!website) throw new NotFoundError()
    const knowledgeProfile = await getLatestKnowledgeProfile(websiteId, organizationId)
    return NextResponse.json({ website, knowledgeProfile })
  })
}

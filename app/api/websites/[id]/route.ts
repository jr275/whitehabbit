import "server-only"

/* GET /api/websites/:id — convenience, flat lookup (org-scoped) for
 * UI that already knows the website id but not its project id. The
 * canonical, API-first path is /api/projects/:projectId/websites/:id
 * (§40); this exists alongside it for the same reason
 * getOrCreateDefaultProject() does — most UI in this revision doesn't
 * yet have a real multi-project picker (docs/architecture/risks.md R-12). */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getLatestKnowledgeProfile } from "@/lib/knowledge-profile/repo"
import { requireSession } from "@/lib/session"
import { getWebsite } from "@/lib/websites/repo"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("websites.get.flat", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const website = await getWebsite(id, organizationId)
    if (!website) throw new NotFoundError()
    const knowledgeProfile = await getLatestKnowledgeProfile(id, organizationId)
    return NextResponse.json({ website, knowledgeProfile })
  })
}

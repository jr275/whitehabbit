import "server-only"

/* POST /api/pages/:id/publish — §55 minimal publishing workflow: only
 * a "ready" (quality-gate-passed) page can be published. Generates
 * JSON-LD (§24), internal links (§25), and marks the page's
 * Opportunity "published" — see lib/pages/publish.ts. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { InvalidJsonLdError, PageNotReadyError, publishPageAction } from "@/lib/pages/publish"
import { getPage } from "@/lib/pages/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("pages.publish", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("page_publish", organizationId)
    const { id } = await params

    const existing = await getPage(id, organizationId)
    if (!existing) throw new NotFoundError()

    try {
      const { page, canonicalUrl } = await publishPageAction(id, organizationId)
      await recordAudit({ orgId: organizationId, userId, action: "page.publish", resourceType: "page", resourceId: id, metadata: { canonicalUrl } })
      return NextResponse.json({ page })
    } catch (err) {
      if (err instanceof PageNotReadyError || err instanceof InvalidJsonLdError) throw new ValidationError(err.message)
      throw err
    }
  })
}

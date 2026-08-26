import "server-only"

/* GET  /api/projects/:projectId/websites — list the org's real,
 *      persisted Websites for this Project.
 * POST /api/projects/:projectId/websites — connect a new website
 *      (§1/§9). Input: { "url": "https://example.com" }. Validates
 *      the URL is a real http(s) address (SSRF-safety itself is
 *      enforced later, at crawl time, by lib/security/ssrf-guard.ts —
 *      this is real input validation, not the security boundary).
 *      Does NOT start discovery — that is a separate, explicit action
 *      (POST .../discover) so a tenant can review before any outbound
 *      crawl happens. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { createWebsite, InvalidWebsiteUrlError, listWebsites } from "@/lib/websites/repo"

type Params = { params: Promise<{ projectId: string }> }

async function requireOwnedProject(projectId: string, orgId: string) {
  const project = await getProject(projectId, orgId)
  if (!project) throw new NotFoundError()
  return project
}

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("websites.list", async () => {
    const { organizationId } = await requireSession()
    const { projectId } = await params
    await requireOwnedProject(projectId, organizationId)
    const websites = await listWebsites(organizationId, projectId)
    return NextResponse.json({ websites })
  })
}

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("websites.create", async () => {
    const { organizationId, userId } = await requireSession()
    const { projectId } = await params
    await requireOwnedProject(projectId, organizationId)
    await enforceRateLimit("website_create", organizationId)

    const body = (await req.json().catch(() => null)) as { url?: string } | null
    if (!body?.url?.trim()) throw new ValidationError('Body must be { "url": "https://example.com" }.')

    let website
    try {
      website = await createWebsite({ orgId: organizationId, projectId, url: body.url, createdBy: userId })
    } catch (err) {
      if (err instanceof InvalidWebsiteUrlError) throw new ValidationError(err.message)
      throw err
    }
    await recordAudit({ orgId: organizationId, userId, action: "website.create", resourceType: "website", resourceId: website.id, metadata: { url: website.url } })
    return NextResponse.json({ website })
  })
}

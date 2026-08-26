import "server-only"

/* GET/POST /api/v1/domains — list/register domains for a project
 * (ADR-010, ADR-018, §15). A newly created domain is always 'pending':
 * never auto-claimed verified (§15). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { createDomain, DuplicateHostnameError, listDomainsForProject } from "@/lib/domains/repo"
import type { DomainKind } from "@/lib/domains/model"
import { requireSession } from "@/lib/session"

const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i

export async function GET(req: Request) {
  return withApiHandler("v1.domains.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const domains = await listDomainsForProject(organizationId, projectId)
    return NextResponse.json({ domains })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.domains.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string; hostname?: string; kind?: DomainKind }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.hostname || !HOSTNAME_PATTERN.test(body.hostname)) throw new ValidationError("A valid hostname is required (e.g. blog.example.com).")
    const kind: DomainKind = body.kind === "subdomain" ? "subdomain" : "custom"

    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    try {
      const domain = await createDomain({ orgId: organizationId, projectId: body.projectId, hostname: body.hostname, kind })
      await recordAudit({ orgId: organizationId, userId, action: "domain.create", resourceType: "domain", resourceId: domain.id })
      return NextResponse.json({ domain }, { status: 201 })
    } catch (err) {
      if (err instanceof DuplicateHostnameError) throw new ValidationError(err.message)
      throw err
    }
  })
}

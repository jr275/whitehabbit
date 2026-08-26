import "server-only"

/* POST /api/v1/domains/:id/verify — triggers a real DNS check (§15).
 * Never assumes success; returns the real outcome either way. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getDomain } from "@/lib/domains/repo"
import { verifyDomain } from "@/lib/domains/verification"
import type { DomainVerificationMethod } from "@/lib/domains/model"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("v1.domains.verify", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await getDomain(id, organizationId)
    if (!existing) throw new NotFoundError()

    let method: DomainVerificationMethod = "dns_txt"
    try {
      const body = (await req.json()) as { method?: DomainVerificationMethod }
      if (body?.method === "dns_cname") method = "dns_cname"
    } catch {
      // no body — default to dns_txt
    }
    if (method !== "dns_txt" && method !== "dns_cname") throw new ValidationError("method must be dns_txt or dns_cname.")

    const outcome = await verifyDomain(id, organizationId, method)
    await recordAudit({ orgId: organizationId, userId, action: "domain.verify", resourceType: "domain", resourceId: id, metadata: { method, success: outcome.success } })

    const domain = await getDomain(id, organizationId)
    return NextResponse.json({ domain, outcome })
  })
}

import "server-only"

/* GET    /api/custom-connectors/[id] — one custom connector, org-scoped
 * PATCH  /api/custom-connectors/[id] — update name/description/
 *                                       category/icon/config
 * DELETE /api/custom-connectors/[id] — delete (cascades its
 *                                       credentials — migrations/
 *                                       0012_custom_connector_credentials.sql)
 *
 * Connector platform audit, Fase D6. Same org-isolation discipline as
 * app/api/connections/[id]/route.ts: a mismatch reads as 404, never
 * 403 — never confirms another organization's connector exists. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { deleteCustomConnector, getCustomConnector, recordAudit, updateCustomConnector } from "@/lib/db/repo"
import { CustomConnectorValidationError, assertValidCategory, assertValidConfig, assertValidDescription, assertValidIcon, assertValidName } from "@/lib/connectors/validate-custom-connector"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("custom_connectors.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const connector = await getCustomConnector(id, organizationId)
    if (!connector) throw new NotFoundError()
    return NextResponse.json({ connector })
  })
}

/** Never touches status/discoveredTools (that's POST .../test and
 * POST .../import-openapi's job) or the credential (POST
 * .../credential's job) — three separate security surfaces, three
 * separate routes, matching updateCustomConnector's own scoping. */
export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler("custom_connectors.update", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await getCustomConnector(id, organizationId)
    if (!existing) throw new NotFoundError()

    const body = (await req.json().catch(() => null)) as { name?: unknown; description?: unknown; category?: unknown; icon?: unknown; config?: unknown } | null
    if (!body) throw new ValidationError("A JSON body is required.")

    try {
      const patch: Parameters<typeof updateCustomConnector>[2] = {}
      if (body.name !== undefined) patch.name = assertValidName(body.name)
      if ("description" in body) patch.description = assertValidDescription(body.description) ?? null
      if ("category" in body) patch.category = assertValidCategory(body.category) ?? null
      if ("icon" in body) patch.icon = assertValidIcon(body.icon) ?? null
      // Real, live SSRF re-check on any config change — the same
      // guarantee creation gets, never weaker on update.
      if (body.config !== undefined) patch.config = await assertValidConfig(existing.kind, body.config)

      const updated = await updateCustomConnector(id, organizationId, patch)
      await recordAudit({ orgId: organizationId, userId, action: "custom_connector_updated", resourceType: "custom_connector", resourceId: id })
      return NextResponse.json({ connector: updated })
    } catch (err) {
      if (err instanceof CustomConnectorValidationError) throw new ValidationError(err.message)
      throw err
    }
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApiHandler("custom_connectors.delete", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const existing = await getCustomConnector(id, organizationId)
    if (!existing) throw new NotFoundError()

    await deleteCustomConnector(id, organizationId)
    await recordAudit({ orgId: organizationId, userId, action: "custom_connector_deleted", resourceType: "custom_connector", resourceId: id, metadata: { name: existing.name } })

    return NextResponse.json({ ok: true })
  })
}

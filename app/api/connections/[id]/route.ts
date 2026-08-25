import "server-only"

/* GET    /api/connections/[id] — one connection, org-scoped
 * PATCH  /api/connections/[id] — update non-secret metadata only (e.g.
 *                                 GA4's defaultPropertyId) — org-scoped
 * DELETE /api/connections/[id] — disconnect (real delete + audit),
 *                                 org-scoped
 *
 * Same org-isolation discipline as app/api/workers/[id]/route.ts: a
 * mismatch reads as 404, never 403, so a request can never confirm
 * another organization's Connection exists at all. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { MetadataValidationError, sanitizeConnectionMetadata } from "@/lib/connectors/sanitize-metadata"
import { deleteConnection, getConnection, recordAudit, updateConnectionStatus } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("connections.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const connection = await getConnection(id, organizationId)
    if (!connection) throw new NotFoundError()
    return NextResponse.json({ connection })
  })
}

/** Merges (never replaces wholesale) new keys into the connection's
 * existing non-secret metadata — so setting GA4's defaultPropertyId
 * can never accidentally drop e.g. Salesforce's instanceUrl or any
 * other key a different flow already wrote. Status/auth/credential
 * state is untouched — this route only ever changes display-only
 * metadata, never connection lifecycle (that's DELETE, or the real
 * OAuth callback). */
export async function PATCH(req: Request, { params }: Params) {
  return withApiHandler("connections.update", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const connection = await getConnection(id, organizationId)
    if (!connection) throw new NotFoundError()

    const body = (await req.json().catch(() => null)) as { metadata?: unknown } | null
    if (!body || typeof body.metadata !== "object" || body.metadata === null) throw new ValidationError("metadata is required.")

    let patch: Record<string, unknown>
    try {
      patch = sanitizeConnectionMetadata(body.metadata)
    } catch (err) {
      if (err instanceof MetadataValidationError) throw new ValidationError(err.message)
      throw err
    }
    const merged = { ...connection.metadata, ...patch }
    const updated = await updateConnectionStatus(id, organizationId, { status: connection.status, metadata: merged, userId })
    return NextResponse.json({ connection: updated })
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApiHandler("connections.delete", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const connection = await getConnection(id, organizationId)
    if (!connection) throw new NotFoundError()

    await deleteConnection(id, organizationId)
    await recordAudit({ orgId: organizationId, userId, action: "connection_disconnected", resourceType: "connection", resourceId: id, metadata: { connectorId: connection.connectorId } })

    return NextResponse.json({ ok: true })
  })
}

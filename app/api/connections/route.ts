import "server-only"

/* GET  /api/connections — list the authenticated org's real Connections.
 * POST /api/connections — create one.
 *
 * There is no real OAuth flow in this phase (see the Phase 1 report).
 * A connector whose authenticationType is "none" (only the internal
 * test connector today) can be connected immediately — that's a real,
 * complete authentication for that connector, not a simulation. Any
 * other authenticationType (oauth2/api_key/service_account/mcp) is
 * created in a real "not_connected"/pending state and explicitly NOT
 * marked connected — there is no real external account behind it yet,
 * and this route must never pretend there is. A disabled connector
 * can never be connected to at all. */

import { NextResponse } from "next/server"
import { withApiHandler, ValidationError, NotFoundError } from "@/lib/api-error"
import { getConnector } from "@/lib/connectors/registry"
import { createConnection, listConnections, recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

const METADATA_KEY_DENYLIST = /token|secret|password|api[_-]?key|credential/i

/** Non-secret only, by construction — never trust the request body to
 * hold a real credential, even though nothing in Phase 1 has one to
 * offer. Any key that even LOOKS like it might carry a secret is
 * rejected outright rather than silently persisted. */
function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (METADATA_KEY_DENYLIST.test(key)) throw new ValidationError(`"${key}" is not allowed in connection metadata.`)
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value
  }
  return result
}

export async function GET() {
  return withApiHandler("connections.list", async () => {
    const { organizationId } = await requireSession()
    const connections = await listConnections(organizationId)
    return NextResponse.json({ connections })
  })
}

export async function POST(req: Request) {
  return withApiHandler("connections.create", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("connection_create", organizationId)

    const body = (await req.json().catch(() => null)) as { connectorId?: string; displayName?: string; metadata?: unknown } | null
    const connectorId = body?.connectorId?.trim()
    if (!connectorId) throw new ValidationError("connectorId is required.")

    const connector = getConnector(connectorId)
    if (!connector) throw new NotFoundError()
    if (!connector.enabled) throw new ValidationError(`${connector.name} is not yet available — architecture only in this phase.`)

    const metadata = sanitizeMetadata(body?.metadata)
    const displayName = typeof body?.displayName === "string" ? body.displayName.slice(0, 120) : undefined

    // "none" auth genuinely completes here — there is nothing external
    // to authenticate against. Every other auth type has no real flow
    // yet, so the connection is created honestly not-connected.
    const canConnectImmediately = connector.authenticationType === "none"

    await recordAudit({ orgId: organizationId, userId, action: "connection_attempted", resourceType: "connector", resourceId: connectorId })

    const connection = await createConnection({
      orgId: organizationId,
      userId,
      connectorId,
      authType: connector.authenticationType,
      status: canConnectImmediately ? "connected" : "not_connected",
      displayName,
      metadata,
    })

    await recordAudit({
      orgId: organizationId,
      userId,
      action: canConnectImmediately ? "connection_connected" : "connection_created",
      resourceType: "connection",
      resourceId: connection.id,
      metadata: { connectorId },
    })

    return NextResponse.json({ connection }, { status: 201 })
  })
}

import "server-only"

/* POST /api/connectors/salesforce/disconnect — real disconnect: clears
 * the encrypted credential and marks the Connection disconnected.
 * Never just hides the UI state. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError } from "@/lib/api-error"
import { listConnections, recordAudit, updateConnectionStatus } from "@/lib/db/repo"
import { clearTokens } from "@/lib/connectors/token-store"
import { requireSession } from "@/lib/session"

const CONNECTOR_ID = "connector_salesforce"

export async function POST() {
  return withApiHandler("connectors.salesforce_disconnect", async () => {
    const { organizationId, userId } = await requireSession()
    const existing = (await listConnections(organizationId)).find((c) => c.connectorId === CONNECTOR_ID)
    if (!existing) throw new NotFoundError()

    await clearTokens(existing.id)
    const connection = await updateConnectionStatus(existing.id, organizationId, { status: "disconnected", userId })
    await recordAudit({ orgId: organizationId, userId, action: "connection_created", resourceType: "connection", resourceId: existing.id, metadata: { connectorId: CONNECTOR_ID, action: "disconnected" } })

    return NextResponse.json({ connection })
  })
}

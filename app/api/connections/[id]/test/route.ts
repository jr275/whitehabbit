import "server-only"

/* POST /api/connections/[id]/test — "Test connection" (section 23/34
 * of the connectivity platform brief). Calls the connector's own real
 * healthCheck() (lib/connectors/types.ts's ConnectorDefinition.
 * healthCheck) — a genuine live reachability check, not an inference
 * from "credentials exist" — and persists the real result via
 * lib/db/repo.ts's recordConnectionHealth(), so /integrations can show
 * a real "last checked"/"last successful call" history, not just the
 * current live state. Org-scoped like every other connection route. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { getConnection, recordConnectionHealth } from "@/lib/db/repo"
import { getConnector } from "@/lib/connectors/registry"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("connections.test", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params

    const connection = await getConnection(id, organizationId)
    if (!connection) throw new NotFoundError()

    const connector = getConnector(connection.connectorId)
    if (!connector) throw new NotFoundError()
    if (!connector.healthCheck) throw new ValidationError(`${connector.name} has no live connectivity check — its status is read from the connection state alone.`)

    const started = Date.now()
    const result = await connector.healthCheck(connection)
    const latencyMs = Date.now() - started
    const ok = result.state === "healthy"

    await recordConnectionHealth(id, organizationId, { ok, errorCode: ok ? undefined : result.state, latencyMs })
    const updated = await getConnection(id, organizationId)

    return NextResponse.json({ health: result, connection: updated })
  })
}

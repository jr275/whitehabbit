import "server-only"

/* POST /api/custom-connectors/[id]/actions/[actionId]/test — run ONE
 * real, read-only discovered action directly, outside a Worker
 * execution and outside the approval gate.
 *
 * Connector platform audit, Fase D6. Mirrors app/api/connections/[id]/
 * actions/[actionId]/route.ts's exact reasoning, applied to dynamic
 * connectors: deliberately restricted to permission: "read" actions
 * only, since this route has no approval gate at all. The generic
 * "call" action (lib/connectors/custom-rest.ts) is now permanently
 * classified delete/high (Fase D5) specifically so it can never pass
 * this check — this route could never become a way to run an
 * arbitrary, unapproved write through a custom connector. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { getCustomConnector } from "@/lib/db/repo"
import { buildDynamicConnectorTools } from "@/lib/connectors/dynamic"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string; actionId: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("custom_connectors.action.test", async () => {
    const { organizationId } = await requireSession()
    const { id, actionId } = await params

    const connector = await getCustomConnector(id, organizationId)
    if (!connector) throw new NotFoundError()

    const declared = connector.discoveredTools.find((a) => a.id === actionId)
    if (!declared) throw new NotFoundError()
    if (declared.permission !== "read") throw new ValidationError(`"${declared.label}" is not a read-only action — it can only run through a Worker execution, with approval enforced.`)

    if (connector.status !== "connected") throw new ValidationError(`${connector.name} is not connected — test the connection before running "${declared.label}".`)

    const input = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const tools = buildDynamicConnectorTools(connector)
    const action = tools.flatMap((t) => t.actions).find((a) => a.id === actionId)
    if (!action) throw new NotFoundError()

    const result = await action.run(input, { workerId: "integration-ui", executionId: `manual_${id}`, emit: () => {} })
    return NextResponse.json({ result })
  })
}

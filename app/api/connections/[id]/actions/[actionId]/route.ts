import "server-only"

/* POST /api/connections/[id]/actions/[actionId] — run ONE real,
 * read-only connector action directly, outside the Agent Runtime.
 *
 * This exists for Studio/Integration UX that needs a real live value
 * right now — e.g. GA4's default-property picker (section 5 of the
 * GA4 vertical slice: "show connected account/properties, allow
 * default-property selection") — without waiting for a Worker
 * execution. It reuses the exact same real tool the Agent Runtime
 * would call (lib/connectors/registry.ts's getConnectorTools(), same
 * health-tracking wrapper included) — there is no second execution
 * path, just a different caller.
 *
 * Deliberately restricted to permission: "read" actions only. Every
 * write/high-risk action in this codebase goes through
 * lib/agent/tool-runner.ts's real approval boundary
 * (toolExecutionBoundary()); this route has no approval gate at all,
 * so it must never be able to reach a write action — read actions are
 * side-effect-free by the same convention every provider adapter in
 * this repo already follows (permission: "read" ⇒ riskLevel: "low"),
 * so skipping the approval gate for them is safe, not a bypass. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { getConnection } from "@/lib/db/repo"
import { getConnector, getConnectorTools } from "@/lib/connectors/registry"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string; actionId: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("connections.action.run", async () => {
    const { organizationId } = await requireSession()
    const { id, actionId } = await params

    const connection = await getConnection(id, organizationId)
    if (!connection) throw new NotFoundError()

    const connector = getConnector(connection.connectorId)
    if (!connector) throw new NotFoundError()

    const declared = connector.actions?.find((a) => a.id === actionId)
    if (!declared) throw new NotFoundError()
    if (declared.permission !== "read") throw new ValidationError(`"${declared.label}" is not a read-only action — it can only run through a Worker execution, with approval enforced.`)

    const input = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const tools = getConnectorTools(connection)
    const action = tools.flatMap((t) => t.actions).find((a) => a.id === actionId)
    if (!action) throw new ValidationError(`${connector.name} is not connected — connect it before running "${declared.label}".`)

    const result = await action.run(input, { workerId: "integration-ui", executionId: `manual_${id}`, emit: () => {} })
    return NextResponse.json({ result })
  })
}

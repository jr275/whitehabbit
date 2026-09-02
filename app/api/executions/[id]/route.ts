import "server-only"

/* GET /api/executions/[id] — reconnect/poll endpoint, and the
 * canonical execution-detail read used by OutputDrawer's fetch
 * fallback (see components/outputs/output-drawer.tsx).
 *
 * A client that missed part or all of the live NDJSON stream (closed
 * the browser, lost the connection, opened a new tab) calls this to
 * recover the real, current, database-backed state of one execution:
 * its current status, every persisted event in order, and its real
 * outputs. This is the durable source of truth — the live stream in
 * the /run response is just a transport for whichever client happens
 * to be connected, and the client's bootstrap store (GET /api/state)
 * only ever holds the org's 500 most recent executions — this route
 * has no such cap, which is what makes "canonical execution detail"
 * actually work for an execution outside that window. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError } from "@/lib/api-error"
import { getExecution, getExecutionEvents, listOutputsForExecution } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("executions.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params

    const execution = await getExecution(id, organizationId)
    if (!execution) throw new NotFoundError()

    const [events, outputs] = await Promise.all([getExecutionEvents(id, organizationId), listOutputsForExecution(id, organizationId)])
    return NextResponse.json({ execution, events, outputs })
  })
}

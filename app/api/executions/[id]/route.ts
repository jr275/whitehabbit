import "server-only"

/* GET /api/executions/[id] — reconnect/poll endpoint.
 *
 * A client that missed part or all of the live NDJSON stream (closed
 * the browser, lost the connection, opened a new tab) calls this to
 * recover the real, current, database-backed state of one execution:
 * its current status and every persisted event in order. This is the
 * durable source of truth — the live stream in the /run response is
 * just a transport for whichever client happens to be connected. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError } from "@/lib/api-error"
import { getExecution, getExecutionEvents } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("executions.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params

    const execution = await getExecution(id, organizationId)
    if (!execution) throw new NotFoundError()

    const events = await getExecutionEvents(id, organizationId)
    return NextResponse.json({ execution, events })
  })
}

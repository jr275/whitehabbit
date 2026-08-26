import "server-only"

/* GET /api/v1/workflows/:id/events — real-time execution events (§27,
 * §29) via a genuine Postgres LISTEN on the 'workflow_events' channel
 * (see migrations/0005_workflow_notify.sql) — NOT a fixed-interval
 * poll dressed up as a stream. A dedicated pool client is checked out
 * for the lifetime of the SSE response and LISTENs on the channel;
 * every notification for this run_id (any org's writes fire the
 * trigger, so events are filtered here, after the tenant check below
 * has already confirmed the caller owns this run) is forwarded to the
 * client as an SSE `event: workflow` message. The connection is
 * released back to the pool when the client disconnects.
 *
 * Runs on the Node.js runtime (this fork's Proxy/route default,
 * AGENTS.md) — Edge cannot hold a raw `pg` connection open. */

import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getPool } from "@/lib/db/client"
import { getWorkflowRun } from "@/lib/workflow/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

interface WorkflowEventPayload {
  kind: "run" | "step"
  orgId: string
  runId: string
  status: string
  pipeline?: string
  step?: string
  updatedAt: number
}

export async function GET(req: Request, { params }: Params) {
  // requireSession()/getWorkflowRun() must succeed before opening the
  // stream — an SSE response, once started, cannot be redirected to a
  // 401/404 JSON body, so the tenant check happens first and normally.
  const { organizationId } = await requireSession()
  const { id } = await params
  const run = await getWorkflowRun(id, organizationId)
  if (!run) {
    return withApiHandler("v1.workflows.events", async () => {
      throw new NotFoundError()
    })
  }

  const pool = getPool()
  const client = await pool.connect()
  await client.query("LISTEN workflow_events")

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send("connected", { runId: id, status: run.status })

      const onNotification = (msg: { channel: string; payload?: string }) => {
        if (msg.channel !== "workflow_events" || !msg.payload) return
        let payload: WorkflowEventPayload
        try {
          payload = JSON.parse(msg.payload)
        } catch {
          return // malformed payload — never crash the stream over one bad notification
        }
        // real tenant isolation on the stream itself: only forward
        // events for this exact run, and only if the org matches the
        // one requireSession() already verified owns it (§29 SSE
        // isolation) — never trust the notify payload's orgId alone.
        if (payload.runId !== id || payload.orgId !== organizationId) return
        send(payload.kind, payload)
      }
      client.on("notification", onNotification)

      // heartbeat so intermediary proxies/load balancers don't time
      // out an idle SSE connection — a real keep-alive, not data.
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: heartbeat\n\n`))
      }, 15_000)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        client.removeListener("notification", onNotification)
        client.query("UNLISTEN workflow_events").catch(() => {})
        client.release()
        try {
          controller.close()
        } catch {
          // already closed by the client disconnecting
        }
      }

      req.signal.addEventListener("abort", cleanup)

      // a terminal run will never notify again — close the stream
      // proactively so a client watching a run that's already done
      // doesn't hold a connection open forever.
      if (["succeeded", "failed", "cancelled", "timed_out"].includes(run.status)) {
        send("terminal", { runId: id, status: run.status })
        cleanup()
      }
    },
    cancel() {
      closed = true
      client.query("UNLISTEN workflow_events").catch(() => {})
      client.release()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

import "server-only"

/* POST /api/workers/[id]/run — the real thing, hardened for production.
 *
 * Streams newline-delimited JSON: one real WorkerEvent per line, the
 * instant it happens, to whichever client is currently connected. But
 * the STREAM is a transport, not the record — lib/agent/runtime.ts
 * persists every task/execution/event/output/metric row to Postgres
 * as it happens (see executeTask), and this handler wraps the whole
 * run in next/server's after() so the underlying execution keeps
 * running to completion on the server even if the browser disconnects
 * mid-stream. A reconnecting client re-reads the real, current state
 * from GET /api/executions/[id] (or the next GET /api/state), not
 * from this stream.
 *
 * Runs the exact frozen WorkerVersion, never the live-editable draft:
 *   mode "release" (default) — the worker's released (live) version
 *   mode "test"               — the latest built version (Test always
 *                                calls /build immediately before this)
 * This is what makes "the runtime executes a specific version, and a
 * later draft edit never changes what's running" actually true. */

import { after } from "next/server"
import { executeTask } from "@/lib/agent/runtime"
import { getLatestWorkerVersion, getWorker, getWorkerVersion, markWorkerTested, recordAudit } from "@/lib/db/repo"
import { logger, newRequestId } from "@/lib/observability/logger"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import type { Worker, WorkerVersion } from "@/lib/workforce/model"

export const runtime = "nodejs"
export const maxDuration = 60 // seconds — Vercel Hobby's configurable ceiling; raise if the plan allows more

type Params = { params: Promise<{ id: string }> }

/** Overlays a frozen WorkerVersion's definition onto the live Worker
 * row's identity fields (id/status/timestamps stay real) — this,
 * not the live draft, is what actually executes. */
function hydrateWorkerFromVersion(worker: Worker, version: WorkerVersion): Worker {
  return { ...worker, ...version.definition }
}

export async function POST(req: Request, { params }: Params) {
  const { organizationId, userId } = await requireSession().catch(() => ({ organizationId: null, userId: null }))
  if (!organizationId) return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 })

  const requestId = newRequestId()
  const rate = await enforceRateLimit("worker_run", organizationId).then(
    () => null,
    (err) => err as Error,
  )
  if (rate) return new Response(JSON.stringify({ error: rate.message }), { status: 429 })

  const { id } = await params
  const worker = await getWorker(id, organizationId)
  if (!worker) return new Response(JSON.stringify({ error: "Worker not found" }), { status: 404 })

  const body = (await req.json().catch(() => null)) as { skillId?: string; input?: Record<string, string>; mode?: "release" | "test" } | null
  if (!body?.skillId) return new Response(JSON.stringify({ error: "skillId is required" }), { status: 400 })

  const mode = body.mode === "test" ? "test" : "release"
  let version: WorkerVersion | null
  if (mode === "release") {
    if (!worker.releasedVersionId) return new Response(JSON.stringify({ error: "This worker has no released version yet. Release it before running." }), { status: 400 })
    version = await getWorkerVersion(worker.releasedVersionId, organizationId)
  } else {
    version = await getLatestWorkerVersion(id, organizationId)
  }
  if (!version) return new Response(JSON.stringify({ error: "No built version found for this worker." }), { status: 400 })

  const runnableWorker = hydrateWorkerFromVersion(worker, version)

  await recordAudit({ orgId: organizationId, userId, action: "execution.run", resourceType: "worker", resourceId: id, metadata: { requestId, mode, versionId: version.id } })
  logger.info("execution_run_request", { requestId, workerId: id, organizationId, mode, versionId: version.id })

  const gen = executeTask({ worker: runnableWorker, orgId: organizationId, workerVersionId: version.id, skillId: body.skillId, input: body.input ?? {} })

  const encoder = new TextEncoder()
  let clientConnected = true

  const stream = new ReadableStream({
    start(controller) {
      let finalEventType: string | null = null
      const drain = (async () => {
        try {
          for await (const event of gen) {
            finalEventType = event.type
            if (clientConnected) {
              try {
                controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
              } catch {
                clientConnected = false // enqueue failing means the client is gone — keep draining below so the run still completes and persists
              }
            }
          }
          // "tested" is a server-verified fact, set only here, only
          // after a real test-mode execution actually completed — never
          // client-settable (see markWorkerTested and the PATCH route's
          // EDITABLE_FIELDS allowlist, which excludes it).
          if (mode === "test" && finalEventType === "task_completed") {
            await markWorkerTested(id, organizationId)
          }
        } catch (err) {
          logger.error("execution_stream_error", { requestId, workerId: id, message: err instanceof Error ? err.message : String(err) })
          if (clientConnected) {
            try {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "stream_error", error: err instanceof Error ? err.message : "Execution failed unexpectedly." }) + "\n"))
            } catch {
              /* client already gone */
            }
          }
        } finally {
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
      })()
      // Guarantees `drain` — and therefore the real execution and every
      // one of its DB writes — completes even after the response is
      // sent and the client has disconnected. This is the one thing
      // standing between "browser closes" and "execution silently dies".
      after(drain)
    },
    cancel() {
      clientConnected = false
    },
  })

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" },
  })
}

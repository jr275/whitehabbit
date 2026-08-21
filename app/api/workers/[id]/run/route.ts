import "server-only"

/* POST /api/workers/[id]/run — the real thing.
 *
 * Streams newline-delimited JSON: one real WorkerEvent per line, the
 * instant it happens. If the run takes 18 real seconds because a real
 * API call takes 18 seconds, this stream takes 18 seconds — nothing
 * here fakes progress to make the wait feel shorter. */

import { executeTask } from "@/lib/agent/runtime"
import { getWorker } from "@/lib/db/repo"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const worker = getWorker(id)
  if (!worker) return new Response(JSON.stringify({ error: "Worker not found" }), { status: 404 })

  const body = (await req.json()) as { skillId: string; input: Record<string, string> }
  if (!body?.skillId) return new Response(JSON.stringify({ error: "skillId is required" }), { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of executeTask({ worker, skillId: body.skillId, input: body.input ?? {} })) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Execution failed unexpectedly."
        controller.enqueue(encoder.encode(JSON.stringify({ type: "stream_error", error: message }) + "\n"))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" },
  })
}

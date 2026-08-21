import "server-only"

/* GET /api/workers/[id]    — one worker, live tool status hydrated
 * PATCH /api/workers/[id]  — persist a worker definition edit
 * DELETE /api/workers/[id] — remove a worker
 *
 * PATCH accepts the full updated Worker object from the client. The
 * Studio Builder already holds the authoritative in-memory copy after
 * each edit; this just makes that edit durable. */

import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { deleteWorker, getWorker, upsertWorker } from "@/lib/db/repo"
import type { Worker } from "@/lib/workforce/model"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const worker = getWorker(id)
  if (!worker) return NextResponse.json({ error: "Worker not found" }, { status: 404 })
  return NextResponse.json({ worker: hydrateWorkerLiveState(worker) })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = (await req.json()) as { worker: Worker }
  if (!body?.worker || body.worker.id !== id) {
    return NextResponse.json({ error: "Worker payload does not match id" }, { status: 400 })
  }
  upsertWorker(body.worker)
  return NextResponse.json({ worker: hydrateWorkerLiveState(body.worker) })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  deleteWorker(id)
  return NextResponse.json({ ok: true })
}

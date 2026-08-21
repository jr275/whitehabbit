import "server-only"

/* POST /api/workers — create a new, empty Worker. Real DB row, no
 * fabricated config: every field starts blank/disabled and the user
 * fills it in through Studio. */

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { ensureDefaultOrg, upsertWorker } from "@/lib/db/repo"
import { buildEmptyWorker } from "@/lib/workforce/seed"

export async function POST() {
  ensureDefaultOrg()
  const worker = buildEmptyWorker(`worker_${randomUUID()}`)
  upsertWorker(worker)
  return NextResponse.json({ worker: hydrateWorkerLiveState(worker) })
}

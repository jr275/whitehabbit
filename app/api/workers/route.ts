import "server-only"

/* GET  /api/workers  — list the authenticated org's real Workers
 * POST /api/workers  — create a new, empty Worker in the authenticated
 *                       org. Real DB row, no fabricated config: every
 *                       field starts blank/disabled and the user
 *                       fills it in through Studio. Rate-limited per
 *                       organization (see lib/rate-limit.ts). */

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { listWorkers, recordAudit, upsertWorker } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { buildEmptyWorker } from "@/lib/workforce/seed"

export async function GET() {
  return withApiHandler("workers.list", async () => {
    const { organizationId } = await requireSession()
    const workers = await listWorkers(organizationId)
    return NextResponse.json({ workers: workers.map(hydrateWorkerLiveState) })
  })
}

export async function POST() {
  return withApiHandler("workers.create", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("worker_create", organizationId)

    const worker = buildEmptyWorker(`worker_${randomUUID()}`)
    const saved = await upsertWorker(worker, organizationId, userId)
    await recordAudit({ orgId: organizationId, userId, action: "worker.create", resourceType: "worker", resourceId: saved.id })
    return NextResponse.json({ worker: hydrateWorkerLiveState(saved) })
  })
}

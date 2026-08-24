import "server-only"

/* POST /api/workers/[id]/release
 *
 * Release: promotes the latest READY WorkerVersion to RELEASED and
 * points the Worker's releasedVersionId at it — the one authoritative
 * "is this live" fact. Requires the worker to actually be tested
 * (same product gate as before), and requires a built version to
 * exist (Test now always builds first — see workforceStore.testWorker
 * — so in normal flow one already exists by the time Release runs). */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { getLatestWorkerVersion, getWorker, recordAudit, releaseWorkerVersion } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("workers.release", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("worker_release", organizationId)
    const { id } = await params

    const worker = await getWorker(id, organizationId)
    if (!worker) throw new NotFoundError()
    if (!worker.tested) throw new ValidationError("Pass the Test step before releasing.")

    const latest = await getLatestWorkerVersion(id, organizationId)
    if (!latest) throw new ValidationError("Build this worker before releasing it.")

    const { worker: released, version } = await releaseWorkerVersion(id, organizationId, latest.id)
    await recordAudit({ orgId: organizationId, userId, action: "worker.release", resourceType: "worker_version", resourceId: version.id, metadata: { workerId: id, versionNumber: version.versionNumber } })

    return NextResponse.json({ worker: hydrateWorkerLiveState(released), version })
  })
}

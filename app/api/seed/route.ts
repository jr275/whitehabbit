import "server-only"

/* POST /api/seed — an explicit, authenticated, user-initiated action
 * that adds the example Worker (Atlas) to the CALLER's own
 * organization. This is intentionally no longer auto-triggered by an
 * empty database (see lib/workforce/store.ts hydrate() — that
 * "seed if zero workers" call was removed) — a production deployment
 * must never silently populate a real organization with demo data
 * just because it's new. The Studio empty state now offers this as a
 * separate, explicit "Load an example worker" action alongside
 * "Create a worker". Idempotent per org: calling it again when the
 * org already has any workers is a no-op. */

import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { withApiHandler } from "@/lib/api-error"
import { buildWorkerVersion, listWorkers, recordAudit, releaseWorkerVersion, upsertWorker } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"
import { buildSeedWorker } from "@/lib/workforce/seed"

export async function POST() {
  return withApiHandler("seed.create", async () => {
    const { organizationId, userId } = await requireSession()

    const existing = await listWorkers(organizationId)
    if (existing.length === 0) {
      const worker = buildSeedWorker()
      await upsertWorker(worker, organizationId, userId)

      // A real Build + Release, not a fabricated "live" flag — the
      // seeded Atlas becomes live the same way any Worker does.
      const definition = {
        identity: worker.identity,
        mission: worker.mission,
        objectives: worker.objectives,
        knowledge: worker.knowledge,
        skills: worker.skills,
        tools: worker.tools,
        integrations: worker.integrations,
        behaviors: worker.behaviors,
        channels: worker.channels,
        outcome: worker.outcome,
        autonomy: worker.autonomy,
      }
      const version = await buildWorkerVersion(worker.id, organizationId, definition, `seed-${worker.id}`)
      await releaseWorkerVersion(worker.id, organizationId, version.id)
      await recordAudit({ orgId: organizationId, userId, action: "worker.seed", resourceType: "worker", resourceId: worker.id })
    }

    const workers = (await listWorkers(organizationId)).map(hydrateWorkerLiveState)
    return NextResponse.json({ workers })
  })
}

import "server-only"

/* POST /api/seed — idempotent dev-only bootstrap: inserts the example
 * Worker DEFINITION if the org has no workers yet. Never inserts a
 * task, execution, output, business event or metric — those only ever
 * come from a real run. Safe to call repeatedly. */

import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { DEFAULT_ORG_ID, ensureDefaultOrg, listWorkers, upsertWorker } from "@/lib/db/repo"
import { buildSeedWorker } from "@/lib/workforce/seed"

export async function POST() {
  ensureDefaultOrg()
  const existing = listWorkers(DEFAULT_ORG_ID)
  if (existing.length === 0) {
    upsertWorker(buildSeedWorker(), DEFAULT_ORG_ID)
  }
  const workers = listWorkers(DEFAULT_ORG_ID).map(hydrateWorkerLiveState)
  return NextResponse.json({ workers })
}

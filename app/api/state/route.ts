import "server-only"

/* GET /api/state — the client's single bootstrap read: every worker,
 * plus the real task/execution/output/metric/business-event ledger. */

import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { ensureDefaultOrg, getBootstrapState } from "@/lib/db/repo"

export async function GET() {
  ensureDefaultOrg()
  const state = getBootstrapState()
  return NextResponse.json({
    ...state,
    workers: state.workers.map(hydrateWorkerLiveState),
  })
}

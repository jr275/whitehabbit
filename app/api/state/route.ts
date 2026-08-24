import "server-only"

/* GET /api/state — the client's single bootstrap read: the
 * authenticated organization's real workers, plus the real task/
 * execution/output/metric/business-event ledger. Org-scoped by
 * requireSession() — never a client-supplied org id. */

import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { withApiHandler } from "@/lib/api-error"
import { getBootstrapState } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET() {
  return withApiHandler("state.get", async () => {
    const { organizationId } = await requireSession()
    const state = await getBootstrapState(organizationId)
    return NextResponse.json({
      ...state,
      workers: state.workers.map(hydrateWorkerLiveState),
    })
  })
}

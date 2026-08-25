import "server-only"

/* GET /api/observatory/workers — real per-worker health (section
 * "WORKER HEALTH"): one org-scoped aggregate query over the real
 * Worker/Execution/Output tables. Every Worker in the org appears,
 * including one that has never run (real zeros/nulls, never hidden
 * or fabricated). */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listWorkerHealth } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET() {
  return withApiHandler("observatory.workers", async () => {
    const { organizationId } = await requireSession()
    const workers = await listWorkerHealth(organizationId)
    return NextResponse.json({ workers })
  })
}

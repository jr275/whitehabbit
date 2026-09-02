import "server-only"

/* GET /api/observatory/outputs — real, bounded recent outputs for
 * Observatory's "Recent outputs" panel (section 6/8 of the
 * productization brief: "WHAT DID THE WORKER ACTUALLY PRODUCE?").
 * Query params: workerId, limit (<=100). */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listRecentOutputs } from "@/lib/db/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("observatory.outputs", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const workerId = url.searchParams.get("workerId") ?? undefined
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined

    const outputs = await listRecentOutputs(organizationId, { workerId, limit })
    return NextResponse.json({ outputs })
  })
}

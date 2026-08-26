import "server-only"

/* POST /api/v1/search-console/properties/:id/detect-signals — runs the
 * real deterministic anomaly detector (§14) over this property's
 * already-imported real data. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProperty } from "@/lib/intelligence/search-console/repo"
import { detectSearchPerformanceSignals } from "@/lib/intelligence/search-console/signal-detection"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.search-console.detect-signals", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const property = await getProperty(id, organizationId)
    if (!property) throw new NotFoundError()

    const signalCount = await detectSearchPerformanceSignals(organizationId, property.projectId, id)
    await recordAudit({ orgId: organizationId, userId, action: "search_console.detect_signals", resourceType: "search_console_property", resourceId: id, metadata: { signalCount } })
    return NextResponse.json({ signalCount })
  })
}

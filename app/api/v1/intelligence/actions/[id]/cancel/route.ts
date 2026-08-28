import "server-only"

/* POST /api/v1/intelligence/actions/:id/cancel — §28. Real: cancels
 * the linked WorkflowRun (best-effort — it may already be terminal)
 * and marks the Action cancelled. A no-op (returns the unchanged
 * action) if it's already terminal, never re-terminalized. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { cancelAction } from "@/lib/intelligence/action-executor"
import { getAction } from "@/lib/intelligence/actions"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.intelligence.actions.cancel", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const cancelled = await cancelAction(id, organizationId)
    if (!cancelled) {
      const existing = await getAction(id, organizationId)
      if (!existing) throw new NotFoundError()
      return NextResponse.json({ action: existing }) // already terminal — a real, honest no-op
    }
    await recordAudit({ orgId: organizationId, userId, action: "action.cancel", resourceType: "intelligence_action", resourceId: id })
    return NextResponse.json({ action: cancelled })
  })
}

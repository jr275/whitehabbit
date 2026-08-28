import "server-only"

/* POST /api/v1/intelligence/actions/:id/retry — §28. Creates a real,
 * new, linked attempt (retryOfActionId) — never mutates the terminal
 * row it retries. Refuses (409) a retry of an action that isn't
 * actually terminal. */

import { NextResponse } from "next/server"
import { ConflictError, NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { retryAction, ActionNotFoundError, ActionNotRetryableError } from "@/lib/intelligence/action-executor"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("v1.intelligence.actions.retry", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const action = await retryAction(id, organizationId).catch((err) => {
      if (err instanceof ActionNotFoundError) throw new NotFoundError()
      if (err instanceof ActionNotRetryableError) throw new ConflictError(err.message)
      throw err
    })
    await recordAudit({ orgId: organizationId, userId, action: "action.retry", resourceType: "intelligence_action", resourceId: id, metadata: { newActionId: action.id, status: action.status } })
    return NextResponse.json({ action }, { status: 202 })
  })
}

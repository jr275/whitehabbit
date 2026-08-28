import "server-only"

/* GET /api/v1/intelligence/actions/:id — a single real Action's full
 * detail (§22's Agent Run Inspector reads this alongside the linked
 * agent_run). */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getAction } from "@/lib/intelligence/actions"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("v1.intelligence.actions.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const action = await getAction(id, organizationId)
    if (!action) throw new NotFoundError()
    return NextResponse.json({ action })
  })
}

import "server-only"

/* GET /api/knowledge/processing/[id] — ingestion status.
 *
 * What the card polls while an item is still being processed. Exposes
 * the state machine and the retry counter, never internal errors. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/platform/errors"
import { queryOne } from "@/lib/platform/db"
import { requireScope } from "@/lib/knowledge/access/scope"
import type { ProcessingResponse } from "@/lib/knowledge/api/contracts"
import { getObject } from "@/lib/knowledge/content/repo"
import { enforceKnowledgeRateLimit } from "@/lib/knowledge/ratelimit"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("knowledge.processing.get", async () => {
    const scope = await requireScope()
    await enforceKnowledgeRateLimit("knowledge_read", scope.workspaceId)

    const { id } = await params
    const object = await getObject(scope, id)
    if (!object) throw new NotFoundError()

    const job = await queryOne<{ attempt: number; max_attempts: number; run_after: string; status: string }>(
      `SELECT attempt, max_attempts, run_after, status FROM knowledge_jobs
       WHERE object_id = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [id, scope.workspaceId],
    )

    const outstanding = job !== null && (job.status === "pending" || job.status === "active")

    const payload: ProcessingResponse = {
      id: object.id,
      status: object.status,
      failureCode: object.failureCode,
      failureMessage: object.failureMessage,
      attempt: job ? job.attempt : null,
      maxAttempts: job ? job.max_attempts : null,
      nextAttemptAt: outstanding ? Number(job.run_after) : null,
      updatedAt: object.updatedAt,
    }
    return NextResponse.json(payload)
  })
}

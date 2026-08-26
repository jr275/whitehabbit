import "server-only"

/* GET /api/agent-runs?subjectType=website|opportunity&subjectId=... —
 * every real agent_run for one subject, newest first. */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { listAgentRunsForSubject } from "@/lib/agent-runs/repo"
import type { AgentRunSubjectType } from "@/lib/agent-runs/model"
import { requireSession } from "@/lib/session"

const VALID_SUBJECT_TYPES: AgentRunSubjectType[] = ["website", "opportunity"]

export async function GET(req: Request) {
  return withApiHandler("agent-runs.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const subjectType = url.searchParams.get("subjectType")
    const subjectId = url.searchParams.get("subjectId")
    if (!subjectType || !VALID_SUBJECT_TYPES.includes(subjectType as AgentRunSubjectType) || !subjectId) {
      throw new ValidationError("Query must include a valid subjectType (website|opportunity) and subjectId.")
    }
    const runs = await listAgentRunsForSubject(organizationId, subjectType as AgentRunSubjectType, subjectId)
    return NextResponse.json({ runs })
  })
}

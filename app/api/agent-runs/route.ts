import "server-only"

/* GET /api/agent-runs?subjectType=website|opportunity&subjectId=... —
 * every real WorkflowRun for one subject, newest first. See also
 * /api/v1/workflows for the fuller Agent Control Center API (§29). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { listWorkflowRunsForSubject } from "@/lib/workflow/repo"
import type { WorkflowSubjectType } from "@/lib/workflow/types"
import { requireSession } from "@/lib/session"

const VALID_SUBJECT_TYPES: WorkflowSubjectType[] = ["website", "opportunity"]

export async function GET(req: Request) {
  return withApiHandler("agent-runs.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const subjectType = url.searchParams.get("subjectType")
    const subjectId = url.searchParams.get("subjectId")
    if (!subjectType || !VALID_SUBJECT_TYPES.includes(subjectType as WorkflowSubjectType) || !subjectId) {
      throw new ValidationError("Query must include a valid subjectType (website|opportunity) and subjectId.")
    }
    const runs = await listWorkflowRunsForSubject(organizationId, subjectType as WorkflowSubjectType, subjectId)
    return NextResponse.json({ runs })
  })
}

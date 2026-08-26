import "server-only"

/* GET /api/v1/workflows — Agent Control Center (§29): every real
 * WorkflowRun for the authenticated org, newest first. Optional
 * ?status=&pipeline= filters. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listWorkflowRuns } from "@/lib/workflow/repo"
import type { WorkflowPipeline, WorkflowStatus } from "@/lib/workflow/types"
import { requireSession } from "@/lib/session"

const VALID_STATUSES: WorkflowStatus[] = ["queued", "running", "waiting", "paused", "waiting_approval", "retrying", "succeeded", "failed", "cancelled", "timed_out"]
const VALID_PIPELINES: WorkflowPipeline[] = ["website_discovery", "content_generation"]

export async function GET(req: Request) {
  return withApiHandler("v1.workflows.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const statusParam = url.searchParams.get("status")
    const pipelineParam = url.searchParams.get("pipeline")
    const status = statusParam && VALID_STATUSES.includes(statusParam as WorkflowStatus) ? (statusParam as WorkflowStatus) : undefined
    const pipeline = pipelineParam && VALID_PIPELINES.includes(pipelineParam as WorkflowPipeline) ? (pipelineParam as WorkflowPipeline) : undefined
    const runs = await listWorkflowRuns(organizationId, { status, pipeline })
    return NextResponse.json({ workflows: runs })
  })
}

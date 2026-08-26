import "server-only"

/* GET/POST /api/v1/signals — real, tenant-scoped Signal records (§10). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { listSignals, recordSignal, type SignalType } from "@/lib/intelligence/signals"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.signals.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const type = url.searchParams.get("type") as SignalType | null
    const entityId = url.searchParams.get("entityId")
    const signals = await listSignals(organizationId, projectId, { type: type ?? undefined, entityId: entityId ?? undefined })
    return NextResponse.json({ signals })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.signals.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string; type?: SignalType; value?: Record<string, unknown>; entityId?: string; source?: string; confidence?: number }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.type) throw new ValidationError("type is required.")
    if (body.confidence == null || body.confidence < 0 || body.confidence > 1) throw new ValidationError("confidence must be between 0 and 1.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const signal = await recordSignal({
      orgId: organizationId,
      projectId: body.projectId,
      type: body.type,
      value: body.value ?? {},
      entityId: body.entityId ?? null,
      source: body.source ?? "manual",
      confidence: body.confidence,
    })
    await recordAudit({ orgId: organizationId, userId, action: "signal.create", resourceType: "signal", resourceId: signal.id })
    return NextResponse.json({ signal }, { status: 201 })
  })
}

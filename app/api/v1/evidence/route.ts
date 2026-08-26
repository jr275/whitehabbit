import "server-only"

/* GET/POST /api/v1/evidence — real, tenant-scoped Evidence (§11). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { listEvidenceForSubject, recordEvidence, type EvidenceSubjectType } from "@/lib/intelligence/evidence"
import { requireSession } from "@/lib/session"

const VALID_SUBJECT_TYPES: EvidenceSubjectType[] = ["opportunity", "insight", "page", "answer", "recommendation", "fact"]

export async function GET(req: Request) {
  return withApiHandler("v1.evidence.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const subjectType = url.searchParams.get("subjectType") as EvidenceSubjectType | null
    const subjectId = url.searchParams.get("subjectId")
    if (!subjectType || !VALID_SUBJECT_TYPES.includes(subjectType) || !subjectId) {
      throw new ValidationError(`subjectType (one of ${VALID_SUBJECT_TYPES.join(", ")}) and subjectId are required.`)
    }
    const evidence = await listEvidenceForSubject(organizationId, subjectType, subjectId)
    return NextResponse.json({ evidence })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.evidence.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as {
      projectId?: string
      subjectType?: EvidenceSubjectType
      subjectId?: string
      source?: string
      sourceType?: string
      sourceUrl?: string
      confidence?: number
    }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.subjectType || !VALID_SUBJECT_TYPES.includes(body.subjectType)) throw new ValidationError(`subjectType must be one of ${VALID_SUBJECT_TYPES.join(", ")}.`)
    if (!body.subjectId) throw new ValidationError("subjectId is required.")
    if (!body.source || !body.sourceType) throw new ValidationError("source and sourceType are required.")
    if (body.confidence == null || body.confidence < 0 || body.confidence > 1) throw new ValidationError("confidence must be between 0 and 1.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const evidence = await recordEvidence({
      orgId: organizationId,
      projectId: body.projectId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      source: body.source,
      sourceType: body.sourceType,
      sourceUrl: body.sourceUrl ?? null,
      confidence: body.confidence,
    })
    await recordAudit({ orgId: organizationId, userId, action: "evidence.create", resourceType: "evidence", resourceId: evidence.id })
    return NextResponse.json({ evidence }, { status: 201 })
  })
}

import "server-only"

/* GET /api/v1/objects/:type/:id — the one shared, tenant-scoped read
 * behind the universal Object Inspector (Phase UI-1/4/5,
 * docs/ontology-ui-architecture-v1.md §2). Dispatches to each real
 * Object Type's own already-real repo functions via
 * lib/ontology/object-resolver.ts — never a parallel data-access
 * layer, never fabricated data. */

import { NextResponse } from "next/server"
import { NotFoundError, ValidationError, withApiHandler } from "@/lib/api-error"
import { getOrCreateDefaultProject, getProject } from "@/lib/projects/repo"
import { resolveObjectDetail, type ObjectType } from "@/lib/ontology/object-resolver"
import { requireSession } from "@/lib/session"

const VALID_TYPES: ObjectType[] = ["entity", "opportunity", "page", "decision", "agent_run", "observation"]

type Params = { params: Promise<{ type: string; id: string }> }

export async function GET(req: Request, { params }: Params) {
  return withApiHandler("v1.objects.get", async () => {
    const { organizationId } = await requireSession()
    const { type, id } = await params
    if (!VALID_TYPES.includes(type as ObjectType)) throw new ValidationError(`Unknown object type "${type}".`)

    const url = new URL(req.url)
    const explicitProjectId = url.searchParams.get("projectId")
    const project = explicitProjectId ? await getProject(explicitProjectId, organizationId) : await getOrCreateDefaultProject(organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const detail = await resolveObjectDetail(organizationId, project.id, type as ObjectType, id)
    if (!detail) throw new NotFoundError()

    return NextResponse.json({ object: detail })
  })
}

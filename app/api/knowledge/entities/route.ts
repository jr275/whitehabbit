import "server-only"

/* GET /api/knowledge/entities — the authenticated org's real Knowledge
 * Graph entities for its default Project. Optional ?type= filter.
 * See docs/adr/ADR-002, docs/architecture/domain-model.md. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listEntities } from "@/lib/knowledge/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("knowledge.entities.list", async () => {
    const { organizationId } = await requireSession()
    const project = await getOrCreateDefaultProject(organizationId)
    const entityType = new URL(req.url).searchParams.get("type") ?? undefined

    const entities = await listEntities(organizationId, project.id, { entityType })
    return NextResponse.json({ entities, projectId: project.id })
  })
}

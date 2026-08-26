import "server-only"

/* GET /api/knowledge/entities/:id — one real entity plus its
 * relationships, evidence, and the opportunities generated from it
 * (§29: "show relationships, show evidence, show source pages, show
 * opportunities"). */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { query } from "@/lib/db/client"
import { getEntity, listEvidenceForEntity, listRelationshipsForEntity } from "@/lib/knowledge/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("knowledge.entities.get", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const entity = await getEntity(id, organizationId)
    if (!entity) throw new NotFoundError()

    const [relationships, evidence, opportunityRows] = await Promise.all([
      listRelationshipsForEntity(id, organizationId),
      listEvidenceForEntity(id, organizationId),
      query<{ id: string; title: string; status: string; final_score: number | null }>(
        "SELECT id, title, status, final_score FROM opportunities WHERE org_id = $1 AND primary_entity_id = $2 ORDER BY created_at DESC",
        [organizationId, id],
      ),
    ])

    const relatedEntityIds = [...new Set(relationships.map((r) => (r.sourceEntityId === id ? r.targetEntityId : r.sourceEntityId)))]
    const relatedEntities = relatedEntityIds.length
      ? await query<{ id: string; name: string; entity_type: string }>(
          `SELECT id, name, entity_type FROM entities WHERE id = ANY($1::text[]) AND org_id = $2`,
          [relatedEntityIds, organizationId],
        )
      : []

    return NextResponse.json({
      entity,
      relationships,
      relatedEntities,
      evidence,
      opportunities: opportunityRows.map((r) => ({ id: r.id, title: r.title, status: r.status, finalScore: r.final_score })),
    })
  })
}

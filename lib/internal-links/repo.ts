import "server-only"

/* ================================================================== *
 * INTERNAL LINKS — repository (§25/§36). Bulk-replace per source page
 * on regeneration — never accumulates duplicate recommendations across
 * repeated runs for the same page.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"
import type { InternalLink } from "./model"

interface InternalLinkSqlRow {
  id: string
  org_id: string
  project_id: string
  source_page_id: string
  target_page_id: string | null
  target_entity_id: string | null
  reason: string
  relationship_type: string | null
  confidence: number | null
  created_at: string
}

function rowToLink(r: InternalLinkSqlRow): InternalLink {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    sourcePageId: r.source_page_id,
    targetPageId: r.target_page_id,
    targetEntityId: r.target_entity_id,
    reason: r.reason,
    relationshipType: r.relationship_type,
    confidence: r.confidence,
    createdAt: Number(r.created_at),
  }
}

export interface CreateInternalLinkInput {
  orgId: string
  projectId: string
  sourcePageId: string
  targetPageId: string | null
  targetEntityId: string | null
  reason: string
  relationshipType: string | null
  confidence: number | null
}

export async function replaceInternalLinksForPage(sourcePageId: string, orgId: string, links: CreateInternalLinkInput[]): Promise<InternalLink[]> {
  await query("DELETE FROM internal_links WHERE source_page_id = $1 AND org_id = $2", [sourcePageId, orgId])
  const created: InternalLink[] = []
  for (const link of links) {
    const id = `link_${randomUUID()}`
    const now = Date.now()
    await query(
      `INSERT INTO internal_links (id, org_id, project_id, source_page_id, target_page_id, target_entity_id, reason, relationship_type, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, link.orgId, link.projectId, link.sourcePageId, link.targetPageId, link.targetEntityId, link.reason, link.relationshipType, link.confidence, now],
    )
    created.push({ id, orgId: link.orgId, projectId: link.projectId, sourcePageId: link.sourcePageId, targetPageId: link.targetPageId, targetEntityId: link.targetEntityId, reason: link.reason, relationshipType: link.relationshipType, confidence: link.confidence, createdAt: now })
  }
  return created
}

export async function listInternalLinksForPage(sourcePageId: string, orgId: string): Promise<InternalLink[]> {
  const rows = await query<InternalLinkSqlRow>("SELECT * FROM internal_links WHERE source_page_id = $1 AND org_id = $2 ORDER BY confidence DESC NULLS LAST", [
    sourcePageId,
    orgId,
  ])
  return rows.map(rowToLink)
}

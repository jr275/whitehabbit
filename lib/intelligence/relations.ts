import "server-only"

/* ================================================================== *
 * INTELLIGENCE RELATIONS (§6, §10, ADR-031) — a generic graph edge for
 * the Decision-layer objects (Signal/Observation/Insight/
 * Recommendation/Decision/Action/Outcome) linking to Entity/Page/
 * Opportunity/Trend/Market/Role/Query. Deliberately separate from the
 * existing opportunity_graph_edges (migrations/0007) — see ADR-031 for
 * why that table is untouched.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"

export type RelationSubjectType = "signal" | "observation" | "insight" | "recommendation" | "decision" | "action" | "outcome"
export type RelationNodeType = "entity" | "page" | "opportunity" | "trend" | "market" | "role" | "query" | "signal" | "observation" | "insight" | "decision"

export interface IntelligenceRelation {
  id: string
  orgId: string
  subjectType: RelationSubjectType
  subjectId: string
  nodeType: RelationNodeType
  nodeId: string
  relation: string
  createdAt: number
}

interface RelationRow {
  id: string
  org_id: string
  subject_type: RelationSubjectType
  subject_id: string
  node_type: RelationNodeType
  node_id: string
  relation: string
  created_at: string
}

function rowToRelation(r: RelationRow): IntelligenceRelation {
  return { id: r.id, orgId: r.org_id, subjectType: r.subject_type, subjectId: r.subject_id, nodeType: r.node_type, nodeId: r.node_id, relation: r.relation, createdAt: Number(r.created_at) }
}

export async function linkIntelligenceNode(orgId: string, subjectType: RelationSubjectType, subjectId: string, nodeType: RelationNodeType, nodeId: string, relation: string): Promise<IntelligenceRelation> {
  const id = `irel_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO intelligence_relations (id, org_id, subject_type, subject_id, node_type, node_id, relation, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
    id,
    orgId,
    subjectType,
    subjectId,
    nodeType,
    nodeId,
    relation,
    now,
  ])
  return { id, orgId, subjectType, subjectId, nodeType, nodeId, relation, createdAt: now }
}

export async function listRelationsForSubject(orgId: string, subjectType: RelationSubjectType, subjectId: string): Promise<IntelligenceRelation[]> {
  const rows = await query<RelationRow>("SELECT * FROM intelligence_relations WHERE org_id = $1 AND subject_type = $2 AND subject_id = $3 ORDER BY created_at ASC", [orgId, subjectType, subjectId])
  return rows.map(rowToRelation)
}

/** The reverse lookup — "what intelligence objects reference this real
 * node" (e.g. every Decision/Recommendation that targets a given
 * Entity) — what the Opportunity Map (§10) needs when a user clicks a
 * node. */
export async function listRelationsForNode(orgId: string, nodeType: RelationNodeType, nodeId: string): Promise<IntelligenceRelation[]> {
  const rows = await query<RelationRow>("SELECT * FROM intelligence_relations WHERE org_id = $1 AND node_type = $2 AND node_id = $3 ORDER BY created_at DESC", [orgId, nodeType, nodeId])
  return rows.map(rowToRelation)
}

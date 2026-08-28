import "server-only"

/* ================================================================== *
 * OPPORTUNITY MAP (§6, §10, ADR-032) — real nodes and edges assembled
 * from already-persisted Observations, Decisions, and their real
 * intelligence_relations edges (never decorative/synthetic layout
 * data). Currently the real, connected subset is Observation ->
 * Decision -> Subject (entity/page/opportunity) — the chain
 * lib/intelligence/decision-scan.ts actually links today. Extending
 * this to Market/Role/Query/Trend/Competitor/Dataset nodes is real
 * follow-up work as more of §1's object model gets linked via
 * linkIntelligenceNode(), not claimed as already wired here.
 * ================================================================== */

import { listObservations } from "./observations"
import { listDecisions } from "./decisions"
import { listRelationsForSubject } from "./relations"

export interface MapNode {
  id: string
  type: string
  label: string
}

export interface MapEdge {
  from: string
  to: string
  relation: string
}

export interface IntelligenceMap {
  nodes: MapNode[]
  edges: MapEdge[]
}

export async function buildIntelligenceMap(orgId: string, projectId: string, limit = 100): Promise<IntelligenceMap> {
  const perKindLimit = Math.min(limit, 200)
  const [observations, decisions] = await Promise.all([listObservations(orgId, projectId, { status: "active", limit: perKindLimit }), listDecisions(orgId, projectId, { limit: perKindLimit })])

  const nodes = new Map<string, MapNode>()
  const edges: MapEdge[] = []

  for (const observation of observations) {
    nodes.set(`observation:${observation.id}`, { id: `observation:${observation.id}`, type: "observation", label: observation.summary })
  }

  for (const decision of decisions) {
    const decisionNodeId = `decision:${decision.id}`
    nodes.set(decisionNodeId, { id: decisionNodeId, type: "decision", label: `${decision.action} (${decision.status})` })

    if (decision.subjectId) {
      const subjectNodeId = `${decision.subjectType}:${decision.subjectId}`
      if (!nodes.has(subjectNodeId)) nodes.set(subjectNodeId, { id: subjectNodeId, type: decision.subjectType, label: decision.subjectId })
      edges.push({ from: decisionNodeId, to: subjectNodeId, relation: "targets" })
    }

    // real edges from intelligence_relations (decision -> observation
    // 'derived_from', linked by decision-scan.ts at creation time)
    const relations = await listRelationsForSubject(orgId, "decision", decision.id)
    for (const relation of relations) {
      const nodeId = `${relation.nodeType}:${relation.nodeId}`
      if (!nodes.has(nodeId)) {
        const relatedObservation = observations.find((o) => o.id === relation.nodeId)
        nodes.set(nodeId, { id: nodeId, type: relation.nodeType, label: relatedObservation?.summary ?? relation.nodeId })
      }
      edges.push({ from: decisionNodeId, to: nodeId, relation: relation.relation })
    }
  }

  return { nodes: [...nodes.values()], edges }
}

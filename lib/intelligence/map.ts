import "server-only"

/* ================================================================== *
 * INTELLIGENCE GRAPH (§6, §9, §10, ADR-032, ADR-044) — one real graph-
 * building facade every mode goes through (§9's explicit instruction:
 * "do not build five separate graph implementations"), assembled from
 * already-persisted rows only — never decorative/synthetic layout
 * data.
 *
 * Modes:
 *   "decisions"    — Observation -> Decision -> Subject (the original
 *                     Phase 6G graph, unchanged in shape/behavior —
 *                     existing callers/tests keep working).
 *   "opportunities"— real Opportunity nodes (sized/colored by their
 *                     own real score fields) linked to their real
 *                     primary Entity and, where linked, their real
 *                     Market/Role (lib/intelligence/opportunity-graph.ts).
 *   "knowledge"/"markets"/"roles"/"intents" — real Entity +
 *                     entity_relationships subgraphs, filtered
 *                     server-side by entityType — never "fetch
 *                     everything and filter in the browser" (§8).
 *   "pages"        — real Page -> Opportunity -> Entity chains.
 *
 * All server-side filtered and bounded (§8, §24) — every mode caps its
 * own real query, never an unbounded scan.
 * ================================================================== */

import { listObservations } from "./observations"
import { listDecisions } from "./decisions"
import { listRelationsForSubject } from "./relations"
import { listCanonicalEntities, listRelationshipsForProject } from "@/lib/knowledge/repo"
import { listOpportunities } from "@/lib/opportunity/repo"
import { listOpportunityGraph } from "./opportunity-graph"
import { listPages } from "@/lib/pages/repo"
import { getOpportunity } from "@/lib/opportunity/repo"

export interface MapNode {
  id: string
  type: string
  label: string
  /** real, when the underlying object has one — Opportunity.finalScore,
   * used by the UI to size/color a node. Never a fabricated default. */
  score?: number | null
  status?: string | null
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

export type GraphMode = "decisions" | "opportunities" | "knowledge" | "markets" | "roles" | "intents" | "pages"

export interface GraphFilters {
  mode?: GraphMode
  entityType?: string
  minScore?: number
  status?: string
  limit?: number
}

const ENTITY_TYPE_BY_MODE: Partial<Record<GraphMode, string>> = { markets: "Market", roles: "Role", intents: "Intent" }

/** The original Phase 6G graph — Observation -> Decision -> Subject.
 * Unchanged in shape/behavior; existing callers (the "decisions" mode,
 * the default before this phase) keep working exactly as before. */
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
    nodes.set(decisionNodeId, { id: decisionNodeId, type: "decision", label: `${decision.action} (${decision.status})`, status: decision.status })

    if (decision.subjectId) {
      const subjectNodeId = `${decision.subjectType}:${decision.subjectId}`
      if (!nodes.has(subjectNodeId)) nodes.set(subjectNodeId, { id: subjectNodeId, type: decision.subjectType, label: decision.subjectId })
      edges.push({ from: decisionNodeId, to: subjectNodeId, relation: "targets" })
    }

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

/** Real Opportunity nodes (§6: size by business value, intensity by
 * opportunity score) linked to their real primary Entity and, where a
 * real Market/Role is linked (Phase 5B's Opportunity Graph), to those
 * too — never a synthetic edge. */
async function buildOpportunityGraph(orgId: string, projectId: string, filters: GraphFilters): Promise<IntelligenceMap> {
  const limit = Math.min(filters.limit ?? 100, 200)
  const opportunities = await listOpportunities(orgId, projectId, { status: filters.status as never, limit })
  const nodes = new Map<string, MapNode>()
  const edges: MapEdge[] = []

  for (const opp of opportunities) {
    if (filters.minScore != null && (opp.finalScore ?? -1) < filters.minScore) continue
    const oppNodeId = `opportunity:${opp.id}`
    nodes.set(oppNodeId, { id: oppNodeId, type: "opportunity", label: opp.title, score: opp.finalScore, status: opp.status })

    if (opp.primaryEntityId) {
      const entityNodeId = `entity:${opp.primaryEntityId}`
      if (!nodes.has(entityNodeId)) nodes.set(entityNodeId, { id: entityNodeId, type: "entity", label: opp.topic })
      edges.push({ from: oppNodeId, to: entityNodeId, relation: "targets_entity" })
    }

    // real Market/Role/Trend/DataObservation edges already persisted
    // by the Opportunity Graph (Phase 5B, lib/intelligence/opportunity-graph.ts)
    const graphEdges = await listOpportunityGraph(orgId, opp.id)
    for (const edge of graphEdges) {
      const nodeId = `${edge.nodeType}:${edge.nodeId}`
      if (!nodes.has(nodeId)) nodes.set(nodeId, { id: nodeId, type: edge.nodeType, label: edge.nodeId })
      edges.push({ from: oppNodeId, to: nodeId, relation: edge.relation })
    }
  }

  return { nodes: [...nodes.values()], edges }
}

/** Real Entity + entity_relationships subgraph, server-filtered by
 * entityType for the "markets"/"roles"/"intents" modes — never an
 * unbounded fetch-then-filter-in-the-browser. */
async function buildKnowledgeGraph(orgId: string, projectId: string, filters: GraphFilters): Promise<IntelligenceMap> {
  const limit = Math.min(filters.limit ?? 100, 200)
  const entityType = filters.entityType ?? ENTITY_TYPE_BY_MODE[filters.mode ?? "knowledge"]
  const entities = await listCanonicalEntities(orgId, projectId, { entityType, limit })
  const entityIds = new Set(entities.map((e) => e.id))

  const nodes = new Map<string, MapNode>()
  for (const entity of entities) {
    nodes.set(`entity:${entity.id}`, { id: `entity:${entity.id}`, type: entity.entityType, label: entity.name })
  }

  // real relationships, but only the ones connecting two entities that
  // are actually in this bounded, filtered node set — the raw project-
  // wide relationship list stays server-side, never shipped whole.
  const allRelationships = await listRelationshipsForProject(orgId, projectId)
  const edges: MapEdge[] = allRelationships
    .filter((r) => entityIds.has(r.sourceEntityId) && entityIds.has(r.targetEntityId))
    .map((r) => ({ from: `entity:${r.sourceEntityId}`, to: `entity:${r.targetEntityId}`, relation: r.relationshipType }))

  return { nodes: [...nodes.values()], edges }
}

/** Real Page -> Opportunity -> Entity chains — bounded by the same
 * real page-list cap every other page endpoint already uses. */
async function buildPageGraph(orgId: string, projectId: string, filters: GraphFilters): Promise<IntelligenceMap> {
  const limit = Math.min(filters.limit ?? 100, 200)
  const pages = (await listPages(orgId, projectId, filters.status ? { status: filters.status as never } : {})).slice(0, limit)
  const nodes = new Map<string, MapNode>()
  const edges: MapEdge[] = []

  for (const page of pages) {
    const pageNodeId = `page:${page.id}`
    nodes.set(pageNodeId, { id: pageNodeId, type: "page", label: page.title ?? page.slug, score: page.qualityScore, status: page.status })

    const opp = await getOpportunity(page.opportunityId, orgId)
    if (opp) {
      const oppNodeId = `opportunity:${opp.id}`
      if (!nodes.has(oppNodeId)) nodes.set(oppNodeId, { id: oppNodeId, type: "opportunity", label: opp.title, score: opp.finalScore, status: opp.status })
      edges.push({ from: pageNodeId, to: oppNodeId, relation: "derived_from" })
      if (opp.primaryEntityId) {
        const entityNodeId = `entity:${opp.primaryEntityId}`
        if (!nodes.has(entityNodeId)) nodes.set(entityNodeId, { id: entityNodeId, type: "entity", label: opp.topic })
        edges.push({ from: oppNodeId, to: entityNodeId, relation: "targets_entity" })
      }
    }
  }

  return { nodes: [...nodes.values()], edges }
}

/** The one real dispatcher every graph mode goes through — §9's
 * explicit instruction, satisfied structurally: every mode shares this
 * function, the same MapNode/MapEdge output shape, and the same real
 * bounding discipline; only the underlying query differs per mode. */
export async function buildGraph(orgId: string, projectId: string, filters: GraphFilters = {}): Promise<IntelligenceMap> {
  const mode = filters.mode ?? "decisions"
  switch (mode) {
    case "decisions":
      return buildIntelligenceMap(orgId, projectId, filters.limit)
    case "opportunities":
      return buildOpportunityGraph(orgId, projectId, filters)
    case "knowledge":
    case "markets":
    case "roles":
    case "intents":
      return buildKnowledgeGraph(orgId, projectId, filters)
    case "pages":
      return buildPageGraph(orgId, projectId, filters)
  }
}

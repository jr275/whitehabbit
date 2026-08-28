import "server-only"

/* ================================================================== *
 * OPPORTUNITY GRAPH + EXPLANATION (§25-26, ADR-024) — real graph edges
 * connecting an Opportunity to the Signal/Trend/Query/Intent/Entity/
 * Role/Market/Evidence/Data/Page nodes that produced it, and a real,
 * deterministic explanation built FROM those edges — never an LLM
 * asked to invent a justification after the fact.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"
import { getEntity } from "@/lib/knowledge/repo"
import { getTrend } from "./trends"
import { getSignal } from "./signals"
import { getPage } from "@/lib/pages/repo"

export type OpportunityGraphNodeType = "signal" | "trend" | "query" | "intent" | "entity" | "role" | "market" | "evidence" | "data_observation" | "business_goal" | "page"

export interface OpportunityGraphEdge {
  id: string
  orgId: string
  opportunityId: string
  nodeType: OpportunityGraphNodeType
  nodeId: string
  relation: string
  createdAt: number
}

interface EdgeRow {
  id: string
  org_id: string
  opportunity_id: string
  node_type: OpportunityGraphNodeType
  node_id: string
  relation: string
  created_at: string
}

function rowToEdge(r: EdgeRow): OpportunityGraphEdge {
  return { id: r.id, orgId: r.org_id, opportunityId: r.opportunity_id, nodeType: r.node_type, nodeId: r.node_id, relation: r.relation, createdAt: Number(r.created_at) }
}

/** A real graph node's own display name, never its raw internal id
 * (Object UI, Fase 2 §"Objects"): Market/Role are real Entity rows (a
 * real sub-type of Entity — docs/fase2-modelo-produto.md), Trend and
 * Page have their own real label/title. The one shared resolver both
 * the Intelligence Field/Graph (lib/intelligence/map.ts) and the
 * universal Object Inspector (lib/ontology/object-resolver.ts) call —
 * never a second, drifting copy. A node type this resolver doesn't yet
 * carry a name lookup for (signal/query/intent/evidence/
 * data_observation/business_goal) still renders — as its own real id,
 * an honestly-named gap, never a fabricated label. */
export async function resolveOpportunityGraphNodeLabel(orgId: string, nodeType: OpportunityGraphNodeType | string, nodeId: string): Promise<string> {
  switch (nodeType) {
    case "market":
    case "role":
    case "entity": {
      const entity = await getEntity(nodeId, orgId)
      return entity?.name ?? nodeId
    }
    case "trend": {
      const trend = await getTrend(nodeId, orgId)
      return trend?.label ?? nodeId
    }
    case "page": {
      const page = await getPage(nodeId, orgId)
      return page ? (page.title ?? page.slug) : nodeId
    }
    default:
      return nodeId
  }
}

export async function linkOpportunityNode(orgId: string, opportunityId: string, nodeType: OpportunityGraphNodeType, nodeId: string, relation: string): Promise<OpportunityGraphEdge> {
  const id = `oge_${randomUUID()}`
  const now = Date.now()
  await query("INSERT INTO opportunity_graph_edges (id, org_id, opportunity_id, node_type, node_id, relation, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    id,
    orgId,
    opportunityId,
    nodeType,
    nodeId,
    relation,
    now,
  ])
  return { id, orgId, opportunityId, nodeType, nodeId, relation, createdAt: now }
}

export async function listOpportunityGraph(orgId: string, opportunityId: string): Promise<OpportunityGraphEdge[]> {
  const rows = await query<EdgeRow>("SELECT * FROM opportunity_graph_edges WHERE org_id = $1 AND opportunity_id = $2 ORDER BY created_at ASC", [orgId, opportunityId])
  return rows.map(rowToEdge)
}

export interface OpportunityExplanation {
  whyNow: string
  whyThisEntity: string | null
  whyThisMarket: string | null
  whyThisRole: string | null
  whyThisIntent: string | null
  whyThisBusiness: string
  whatEvidence: string
  whatData: string
  whatInformationGain: string
  whatRisk: string
  recommendedAction: string
}

/** Real, deterministic — assembled from the opportunity's own real
 * fields and its graph edges, never an LLM asked to justify a decision
 * after the fact (§26). Any dimension with nothing real behind it says
 * so honestly rather than being padded out. */
export async function explainOpportunity(
  orgId: string,
  opportunity: { id: string; opportunityType: string | null; title: string; topic: string; targetIntent: string | null; primaryEntityId: string | null; finalScore: number | null; informationGainScore: number | null; informationGainReasons: string[] | null },
): Promise<OpportunityExplanation> {
  const edges = await listOpportunityGraph(orgId, opportunity.id)
  const trendEdge = edges.find((e) => e.nodeType === "trend")
  const marketEdge = edges.find((e) => e.nodeType === "market")
  const roleEdge = edges.find((e) => e.nodeType === "role")
  const evidenceEdges = edges.filter((e) => e.nodeType === "evidence")
  const dataEdges = edges.filter((e) => e.nodeType === "data_observation")

  let whyNow = `Discovered by the ${opportunity.opportunityType ?? "discovery"} pipeline — no time-sensitive trigger recorded.`
  if (trendEdge) {
    const trend = await getTrend(trendEdge.nodeId, orgId)
    if (trend) {
      whyNow = `A real "${trend.state}" trend was detected (velocity ${trend.velocity >= 0 ? "+" : ""}${trend.velocity.toFixed(1)}%, confidence ${(trend.confidence * 100).toFixed(0)}%) — see trend ${trend.id}.`
    }
  }

  let whyThisEntity: string | null = null
  if (opportunity.primaryEntityId) {
    const entity = await getEntity(opportunity.primaryEntityId, orgId)
    whyThisEntity = entity ? `Targets "${entity.name}" (${entity.entityType}) — a real, already-known entity in this project's Knowledge Graph.` : "Targets an entity that no longer exists in the Knowledge Graph."
  }

  const whyThisMarket = marketEdge ? `Linked to a real market node (${marketEdge.nodeId}).` : null
  const whyThisRole = roleEdge ? `Linked to a real role node (${roleEdge.nodeId}).` : null
  const whyThisIntent = opportunity.targetIntent ? `Target intent classified as "${opportunity.targetIntent}".` : null

  const whyThisBusiness = opportunity.finalScore != null ? `Final opportunity score: ${opportunity.finalScore.toFixed(1)}/100 — see the opportunity's own score breakdown for each component.` : "No final score computed yet."

  const whatEvidence = evidenceEdges.length > 0 ? `${evidenceEdges.length} real evidence record(s) linked.` : "No evidence linked yet."
  const whatData = dataEdges.length > 0 ? `${dataEdges.length} real external data observation(s) linked.` : "No external data linked."

  const whatInformationGain =
    opportunity.informationGainScore != null
      ? `Information Gain: ${opportunity.informationGainScore}/100. ${opportunity.informationGainReasons?.join(" ") ?? ""}`.trim()
      : "Information Gain not yet computed for this opportunity."

  const whatRisk = "Risk is classified deterministically at content-generation time (lib/content-pipeline/risk.ts) — not yet computed for an opportunity that hasn't been generated."

  const recommendedAction =
    opportunity.informationGainScore != null && opportunity.informationGainScore < 40
      ? "RESEARCH — Information Gain is too low to justify a new page yet; gather more evidence first."
      : "CREATE — sufficient signal and (where computed) Information Gain to justify generating a page."

  return { whyNow, whyThisEntity, whyThisMarket, whyThisRole, whyThisIntent, whyThisBusiness, whatEvidence, whatData, whatInformationGain, whatRisk, recommendedAction }
}

/** Convenience — links a real signal's own upstream context (used by
 * the trend->opportunity path, §16) in one call. */
export async function linkSignalContext(orgId: string, opportunityId: string, signalId: string): Promise<void> {
  const signal = await getSignal(signalId, orgId)
  if (!signal) return
  await linkOpportunityNode(orgId, opportunityId, "signal", signalId, "derived_from")
  if (signal.entityId) await linkOpportunityNode(orgId, opportunityId, "entity", signal.entityId, "targets")
  if (signal.marketId) await linkOpportunityNode(orgId, opportunityId, "market", signal.marketId, "targets")
  if (signal.roleId) await linkOpportunityNode(orgId, opportunityId, "role", signal.roleId, "targets")
}

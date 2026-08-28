import "server-only"

/* Real assembler for InformationGainV2Input — gathers every component's
 * real inputs from already-persisted data (Knowledge Graph, Evidence,
 * Opportunity Graph, external data, Deep Research) so
 * computeInformationGainV2() itself stays pure/unit-testable. */

import { listCanonicalEntities, listEvidenceForEntity, listRelationshipsForEntity } from "@/lib/knowledge/repo"
import { hasPageForEntity } from "@/lib/pages/repo"
import { listEvidenceForSubject } from "@/lib/intelligence/evidence"
import { listOpportunityGraph } from "@/lib/intelligence/opportunity-graph"
import { getRole } from "@/lib/intelligence/roles"
import { runDeepResearch } from "@/lib/intelligence/deep-research"
import type { InformationGainV2Input } from "./information-gain-v2"
import type { Opportunity } from "./model"

export async function buildInformationGainV2Input(orgId: string, projectId: string, opportunity: Opportunity): Promise<{ input: InformationGainV2Input; hasExistingSimilarPage: boolean }> {
  let relatedEntityCount = 0
  let siblingEntityCount = 0
  let structuredDataEvidenceCount = 0
  let hasLocalEvidence = false
  let hasExistingSimilarPage = false

  if (opportunity.primaryEntityId) {
    const relationships = await listRelationshipsForEntity(opportunity.primaryEntityId, orgId)
    relatedEntityCount = new Set(relationships.map((r) => r.targetEntityId)).size
    const evidence = await listEvidenceForEntity(opportunity.primaryEntityId, orgId)
    // Same real heuristics lib/opportunity/discovery.ts's V1 scorer
    // already uses on this exact evidence — every entity_evidence row
    // this codebase ever writes carries sourceType "crawl" (see
    // ingest-from-crawl.ts), so a literal sourceType === "structured_data"
    // check here would never match anything real. High-confidence
    // evidence (>=0.85) is the actual, already-established real proxy
    // for "this fact came from real structured data on the tenant's own
    // site," and entity type (not fragile fact-string matching) is the
    // real signal for local specificity.
    structuredDataEvidenceCount = evidence.filter((e) => e.confidence != null && e.confidence >= 0.85).length
    const entities = await listCanonicalEntities(orgId, projectId, { limit: 500 })
    const entity = entities.find((e) => e.id === opportunity.primaryEntityId)
    const neighborTypes = new Set(relationships.map((r) => entities.find((e) => e.id === r.targetEntityId)?.entityType).filter((t): t is string => !!t))
    hasLocalEvidence = entity?.entityType === "Place" || entity?.entityType === "Market" || neighborTypes.has("Place") || neighborTypes.has("Market")
    hasExistingSimilarPage = await hasPageForEntity(projectId, opportunity.primaryEntityId)
    siblingEntityCount = entity ? entities.filter((e) => e.entityType === entity.entityType && e.id !== entity.id).length : 0
  }

  const genericEvidence = await listEvidenceForSubject(orgId, "opportunity", opportunity.id)
  const evidenceCount = genericEvidence.length
  const evidenceAvgConfidence = evidenceCount ? genericEvidence.reduce((sum, e) => sum + e.confidence, 0) / evidenceCount : null
  const evidenceVerifiedRatio = evidenceCount ? genericEvidence.filter((e) => e.verificationStatus === "verified").length / evidenceCount : null
  const mostRecentEvidenceAgeMs = evidenceCount ? Date.now() - Math.max(...genericEvidence.map((e) => e.retrievedAt)) : null

  const graph = await listOpportunityGraph(orgId, opportunity.id)
  const marketEdge = graph.find((e) => e.nodeType === "market")
  const roleEdge = graph.find((e) => e.nodeType === "role")
  const dataEdges = graph.filter((e) => e.nodeType === "data_observation")

  let roleHasRealFields = false
  if (roleEdge) {
    const role = await getRole(roleEdge.nodeId, orgId)
    roleHasRealFields = !!role && (role.questions.length > 0 || role.painPoints.length > 0 || role.kpis.length > 0)
  }

  const research = await runDeepResearch(orgId, projectId, opportunity)

  const input: InformationGainV2Input = {
    relatedEntityCount,
    siblingEntityCount,
    structuredDataEvidenceCount,
    hasLocalEvidence,
    hasMarketLink: !!marketEdge,
    marketMetricObservationCount: dataEdges.length,
    hasRoleLink: !!roleEdge,
    roleHasRealFields,
    externalDataObservationCount: dataEdges.length,
    hasComputedDataObservation: false, // real detection of a "computed" observation flag is future work — never guessed
    evidenceCount,
    evidenceAvgConfidence,
    evidenceVerifiedRatio,
    mostRecentEvidenceAgeMs,
    researchGapCount: research.gaps.length,
    researchSourceCount: research.sources.length,
  }
  return { input, hasExistingSimilarPage }
}

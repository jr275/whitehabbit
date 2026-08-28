import "server-only"

/* ================================================================== *
 * OPPORTUNITY DISCOVERY — connects the Opportunity Engine to real
 * website data (§10). Every opportunity comes from a real, observed
 * gap in the Knowledge Graph — never generated because "an LLM thought
 * it might be a good topic." Capped at MAX_OPPORTUNITIES_PER_RUN (§10:
 * "do not generate thousands").
 * ================================================================== */

import type { Entity } from "@/lib/knowledge/model"
import { listCanonicalEntities, listEvidenceForEntity, listRelationshipsForProject } from "@/lib/knowledge/repo"
import { hasPageForEntity } from "@/lib/pages/repo"
import { computeInformationGain } from "./information-gain"
import { createOpportunity, getOpportunityForEntityAndType } from "./repo"
import { computeFinalScore } from "./scoring"
import type { Opportunity, OpportunityScoreComponents, OpportunityType } from "./model"

export const MAX_OPPORTUNITIES_PER_RUN = 20

// Exported (Phase 7, ADR-038) so lib/intelligence/action-executor.ts's
// Decision -> Opportunity bridge scores a single, decision-driven
// entity with the exact same real table discovery.ts's own batch scan
// uses — never a second, drifting copy of the same business logic.
export const BUSINESS_VALUE_BY_TYPE: Record<string, number> = {
  Organization: 90,
  Product: 80,
  Service: 80,
  Market: 70,
  Place: 60,
  Question: 50,
  Person: 40,
  Event: 40,
}

interface OpportunityPlan {
  entity: Entity
  type: OpportunityType
  title: string
  targetIntent: string
  outline: string[]
}

function planFor(entity: Entity, type: OpportunityType, otherNames: string[] = []): OpportunityPlan {
  switch (type) {
    case "market_gap":
      return {
        entity,
        type,
        title: `Content for the ${entity.name} market`,
        targetIntent: `Local/commercial — audiences researching options in ${entity.name}`,
        outline: ["Market overview", "What's available", "Who it's for", "Related entities"],
      }
    case "question_gap":
      return {
        entity,
        type,
        title: entity.name.length > 70 ? `${entity.name.slice(0, 70)}…` : entity.name,
        targetIntent: "Informational — a specific, unanswered real question",
        outline: ["Direct answer", "Supporting details", "Related questions"],
      }
    case "comparison":
      return {
        entity,
        type,
        title: `Compare ${entity.entityType} options${otherNames.length ? `: ${[entity.name, ...otherNames].slice(0, 3).join(" vs. ")}` : ""}`,
        targetIntent: "Comparison — evaluating multiple real options against each other",
        outline: ["Overview", "Side-by-side comparison", "Key differences", "Recommendation"],
      }
    case "hub":
      return {
        entity,
        type,
        title: `${entity.name}: complete overview`,
        targetIntent: "Informational — a comprehensive entry point into everything related to this entity",
        outline: ["Overview", "Key facts", "Related entities", "Frequently asked questions"],
      }
    case "spoke":
      return {
        entity,
        type,
        title: `${entity.name} — in depth`,
        targetIntent: `Informational — detail page supporting the broader hub entity`,
        outline: ["Overview", "Key facts", "How it relates", "Sources"],
      }
    case "supporting_content":
      return {
        entity,
        type,
        title: `How ${entity.name} supports your needs`,
        targetIntent: "Informational — supporting content for an existing offering",
        outline: ["Overview", "Use cases", "Related offerings"],
      }
    case "entity_coverage_gap":
    default:
      return {
        entity,
        type: "entity_coverage_gap",
        title: `${entity.name}: what you need to know`,
        targetIntent: `Informational — learn about ${entity.name}`,
        outline: ["Overview", "Key facts", "Why it matters", "Related entities"],
      }
  }
}

export async function discoverOpportunities(params: { orgId: string; projectId: string; websiteId: string; agentRunId: string }): Promise<Opportunity[]> {
  const { orgId, projectId, websiteId, agentRunId } = params
  const entities = await listCanonicalEntities(orgId, projectId, { limit: 500 })
  if (entities.length === 0) return []

  const relationships = await listRelationshipsForProject(orgId, projectId)
  const entityById = new Map(entities.map((e) => [e.id, e]))
  const neighbors = new Map<string, Set<string>>()
  const degree = new Map<string, number>()
  for (const r of relationships) {
    if (!entityById.has(r.sourceEntityId) || !entityById.has(r.targetEntityId)) continue
    if (!neighbors.has(r.sourceEntityId)) neighbors.set(r.sourceEntityId, new Set())
    if (!neighbors.has(r.targetEntityId)) neighbors.set(r.targetEntityId, new Set())
    neighbors.get(r.sourceEntityId)!.add(r.targetEntityId)
    neighbors.get(r.targetEntityId)!.add(r.sourceEntityId)
    degree.set(r.sourceEntityId, (degree.get(r.sourceEntityId) ?? 0) + 1)
    degree.set(r.targetEntityId, (degree.get(r.targetEntityId) ?? 0) + 1)
  }

  let hub: Entity | null = null
  let hubDegree = 0
  for (const e of entities) {
    const d = degree.get(e.id) ?? 0
    if (d > hubDegree) {
      hubDegree = d
      hub = e
    }
  }
  const hubEntity = hubDegree >= 2 ? hub : null

  const byType = new Map<string, Entity[]>()
  for (const e of entities) {
    const list = byType.get(e.entityType) ?? []
    list.push(e)
    byType.set(e.entityType, list)
  }

  const plans: OpportunityPlan[] = []

  if (hubEntity) plans.push(planFor(hubEntity, "hub"))

  for (const entity of entities) {
    if (hubEntity && entity.id === hubEntity.id) continue
    if (entity.entityType === "Market") {
      plans.push(planFor(entity, "market_gap"))
    } else if (entity.entityType === "Question") {
      plans.push(planFor(entity, "question_gap"))
    } else if (hubEntity && (neighbors.get(entity.id)?.has(hubEntity.id) ?? false)) {
      plans.push(planFor(entity, "spoke"))
    } else {
      plans.push(planFor(entity, "entity_coverage_gap"))
    }
  }

  for (const [type, group] of byType) {
    if (group.length >= 2 && type !== "Question" && type !== "Market") {
      plans.push(planFor(group[0], "comparison", group.slice(1).map((e) => e.name)))
    }
  }

  const created: Opportunity[] = []
  for (const plan of plans) {
    if (created.length >= MAX_OPPORTUNITIES_PER_RUN) break
    const existing = await getOpportunityForEntityAndType(orgId, projectId, plan.entity.id, plan.type)
    if (existing) continue

    const evidence = await listEvidenceForEntity(plan.entity.id, orgId)
    const relatedCount = neighbors.get(plan.entity.id)?.size ?? 0
    const sourceDiversity = new Set(evidence.map((e) => e.sourceUrl).filter((u): u is string => !!u)).size
    const structuredCount = evidence.filter((e) => e.confidence != null && e.confidence >= 0.85).length
    const localNeighborTypes = [...(neighbors.get(plan.entity.id) ?? [])].map((id) => entityById.get(id)?.entityType)
    const hasLocalEvidence = plan.entity.entityType === "Place" || plan.entity.entityType === "Market" || localNeighborTypes.includes("Place") || localNeighborTypes.includes("Market")
    const siblingEntityCount = (byType.get(plan.entity.entityType)?.length ?? 1) - 1
    const existingPageForEntity = await hasPageForEntity(projectId, plan.entity.id)

    const infoGain = computeInformationGain({
      relatedEntityCount: relatedCount,
      sourceDiversity,
      structuredDataEvidenceCount: structuredCount,
      hasLocalEvidence,
      siblingEntityCount,
      existingPageForEntity,
    })
    const entityCoverageScore = Math.min(100, evidence.length * 20 + relatedCount * 10)
    const businessValueScore = BUSINESS_VALUE_BY_TYPE[plan.entity.entityType] ?? 50

    const scores: OpportunityScoreComponents = {
      sourceGroundingScore: null,
      outlineCompletenessScore: null,
      confidenceScore: null,
      entityCoverageScore,
      demandScore: null,
      trendScore: null,
      businessValueScore,
      competitionScore: null,
      authorityGapScore: null,
      informationGainScore: infoGain.score,
      citationPotentialScore: null,
      cannibalizationRiskScore: null,
    }
    const { finalScore, notes } = computeFinalScore(scores)

    const opportunity = await createOpportunity({
      orgId,
      projectId,
      sourceAgentRunId: agentRunId,
      websiteId,
      opportunityType: plan.type,
      primaryEntityId: plan.entity.id,
      title: plan.title,
      topic: plan.entity.name,
      targetIntent: plan.targetIntent,
      outline: plan.outline,
      scores,
      finalScore,
      scoreNotes: notes,
      informationGainReasons: infoGain.reasons,
    })
    created.push(opportunity)
  }

  return created
}

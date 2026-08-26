import "server-only"

/* ================================================================== *
 * PAGE BRIEF BUILDER — derives a real, structured brief from an
 * approved Opportunity and the actual Knowledge Graph around its
 * primary entity (§14). Every field traces to a real row; nothing
 * here is invented — a brief with no primary entity gets honestly
 * empty secondary-entity/market/role fields, not guessed ones.
 * ================================================================== */

import { getEntity, listEvidenceForEntity, listRelationshipsForEntity } from "@/lib/knowledge/repo"
import type { Opportunity } from "@/lib/opportunity/model"
import { createPageBrief } from "./repo"
import type { PageBrief } from "./model"

export async function buildPageBriefFromOpportunity(opportunity: Opportunity): Promise<PageBrief> {
  let secondaryEntityIds: string[] = []
  let market: string | null = null
  let role: string | null = null
  const questions: string[] = []
  let requiredEvidence: string[] = []
  let primaryEntityType: string | null = null

  if (opportunity.primaryEntityId) {
    const primaryEntity = await getEntity(opportunity.primaryEntityId, opportunity.orgId)
    primaryEntityType = primaryEntity?.entityType ?? null

    const relationships = await listRelationshipsForEntity(opportunity.primaryEntityId, opportunity.orgId)
    const neighborIds = [...new Set(relationships.map((r) => (r.sourceEntityId === opportunity.primaryEntityId ? r.targetEntityId : r.sourceEntityId)))].slice(0, 10)
    secondaryEntityIds = neighborIds

    for (const id of neighborIds) {
      const neighbor = await getEntity(id, opportunity.orgId)
      if (!neighbor) continue
      if ((neighbor.entityType === "Market" || neighbor.entityType === "Place") && !market) market = neighbor.name
      if (neighbor.entityType === "Role" && !role) role = neighbor.name
      if (neighbor.entityType === "Question") questions.push(neighbor.name)
    }

    const evidence = await listEvidenceForEntity(opportunity.primaryEntityId, opportunity.orgId)
    requiredEvidence = evidence.map((e) => e.fact).slice(0, 10)
  }

  if (questions.length === 0 && opportunity.opportunityType === "question_gap") questions.push(opportunity.topic)

  const informationGainStrategy = opportunity.informationGainReasons?.length
    ? `Real, observed information-gain signals for this entity: ${opportunity.informationGainReasons.join("; ")}`
    : opportunity.scoreNotes

  const schemaStrategy = ["WebPage", "BreadcrumbList"]
  if (primaryEntityType === "Organization") schemaStrategy.push("Organization")
  if (questions.length > 0) schemaStrategy.push("FAQPage")

  return createPageBrief({
    orgId: opportunity.orgId,
    projectId: opportunity.projectId,
    opportunityId: opportunity.id,
    targetIntent: opportunity.targetIntent,
    primaryEntityId: opportunity.primaryEntityId,
    secondaryEntityIds,
    market,
    role,
    questions,
    informationGainStrategy,
    requiredEvidence,
    recommendedSections: opportunity.outline.length ? opportunity.outline : ["Overview", "Key facts", "Sources"],
    schemaStrategy,
    internalLinkStrategy: "Link to related entities' pages and this topic's hub page, where one exists (lib/internal-links).",
    sourceRequirements: requiredEvidence.length
      ? ["Every factual claim must cite one of the evidence facts already recorded for this entity."]
      : ["No prior evidence is recorded for this entity — the research step must draw only from the Knowledge Graph and crawl data that does exist, and mark any gap as needing verification rather than inventing a fact."],
  })
}

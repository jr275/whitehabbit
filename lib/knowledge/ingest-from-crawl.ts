import "server-only"

/* ================================================================== *
 * ENTITY EXTRACTION + RESOLUTION, applied to a real crawl (§6-9). Ties
 * together lib/knowledge/extraction.ts (candidates) and
 * lib/knowledge/resolution.ts (auto-merge/review/distinct thresholds)
 * into real, persisted entities + evidence + relationships.
 * ================================================================== */

import type { CrawlPage } from "@/lib/crawler/model"
import { extractEntityCandidatesByPage, type EntityCandidate } from "./extraction"
import { addEvidence, createRelationship, relationshipExists, resolveOrCreateEntity } from "./repo"
import type { ResolutionThresholds } from "./resolution"
import { DEFAULT_RESOLUTION_THRESHOLDS } from "./resolution"

export interface EntityExtractionSummary {
  /** flattened, for the Knowledge Profile builder — real type+name+confidence per candidate actually persisted */
  persistedCandidates: { type: string; name: string; confidence: number }[]
  createdCount: number
  exactMatchCount: number
  autoMergedCount: number
  reviewCandidateCount: number
  relationshipsCreated: number
}

interface RelationshipRule {
  fromType: string
  toType: string
  relationshipType: string
}

/* Real, first-class relationships (§8) — only created between entities
 * that co-occurred on the same crawled page (a real, checkable
 * proximity signal), never because "an LLM guessed a relationship
 * exists" (§8's explicit prohibition). Generic types only — the same
 * rule set works whatever the tenant's actual vertical is. */
const RELATIONSHIP_RULES: RelationshipRule[] = [
  { fromType: "Organization", toType: "Product", relationshipType: "OFFERS" },
  { fromType: "Organization", toType: "Service", relationshipType: "OFFERS" },
  { fromType: "Organization", toType: "Place", relationshipType: "LOCATED_IN" },
  { fromType: "Organization", toType: "Market", relationshipType: "SERVES" },
  { fromType: "Organization", toType: "Question", relationshipType: "ANSWERS" },
]

export async function runEntityExtraction(
  orgId: string,
  projectId: string,
  pages: CrawlPage[],
  thresholds: ResolutionThresholds = DEFAULT_RESOLUTION_THRESHOLDS,
): Promise<EntityExtractionSummary> {
  const byPage = extractEntityCandidatesByPage(pages)
  const summary: EntityExtractionSummary = {
    persistedCandidates: [],
    createdCount: 0,
    exactMatchCount: 0,
    autoMergedCount: 0,
    reviewCandidateCount: 0,
    relationshipsCreated: 0,
  }

  for (const [, candidates] of byPage) {
    // resolvedByType lets relationship inference below find "the
    // Organization entity resolved from this page" etc., using
    // canonical entity ids (a merge target if one occurred).
    const resolvedByType = new Map<string, { candidate: EntityCandidate; entityId: string }[]>()

    for (const candidate of candidates) {
      const result = await resolveOrCreateEntity(orgId, projectId, candidate.type, candidate.name, {}, thresholds)
      if (result.decision === "exact") summary.exactMatchCount += 1
      else if (result.decision === "auto_merge") summary.autoMergedCount += 1
      else if (result.decision === "review_candidate") summary.reviewCandidateCount += 1
      else summary.createdCount += 1

      const effectiveEntityId = result.mergedInto?.id ?? result.entity.id
      await addEvidence({
        orgId,
        projectId,
        entityId: result.entity.id,
        fact: candidate.evidence,
        sourceUrl: candidate.sourceUrl,
        sourceType: "crawl",
        confidence: candidate.confidence,
        crawlPageId: candidate.crawlPageId,
      })
      summary.persistedCandidates.push({ type: candidate.type, name: candidate.name, confidence: candidate.confidence })

      const list = resolvedByType.get(candidate.type) ?? []
      list.push({ candidate, entityId: effectiveEntityId })
      resolvedByType.set(candidate.type, list)
    }

    for (const rule of RELATIONSHIP_RULES) {
      const sources = resolvedByType.get(rule.fromType) ?? []
      const targets = resolvedByType.get(rule.toType) ?? []
      for (const source of sources) {
        for (const target of targets) {
          if (source.entityId === target.entityId) continue
          if (await relationshipExists(orgId, source.entityId, target.entityId, rule.relationshipType)) continue
          await createRelationship({
            orgId,
            projectId,
            sourceEntityId: source.entityId,
            targetEntityId: target.entityId,
            relationshipType: rule.relationshipType,
            confidence: Math.min(source.candidate.confidence, target.candidate.confidence),
            source: "website_discovery",
          })
          summary.relationshipsCreated += 1
        }
      }
    }
  }

  return summary
}

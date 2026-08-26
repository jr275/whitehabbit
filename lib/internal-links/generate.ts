import "server-only"

/* ================================================================== *
 * INTERNAL LINK GENERATION (§25/§36) — real entity-relationship-based
 * recommendations, never keyword similarity, never "link every page to
 * every page." Capped at MAX_LINKS_PER_PAGE.
 * ================================================================== */

import { getEntity, listRelationshipsForEntity } from "@/lib/knowledge/repo"
import { getPageForEntity } from "@/lib/pages/repo"
import type { Page } from "@/lib/pages/model"
import { replaceInternalLinksForPage } from "./repo"
import type { InternalLink } from "./model"

export const MAX_LINKS_PER_PAGE = 5

export async function generateInternalLinks(page: Page, primaryEntityId: string | null): Promise<InternalLink[]> {
  if (!primaryEntityId) {
    return replaceInternalLinksForPage(page.id, page.orgId, [])
  }

  const relationships = await listRelationshipsForEntity(primaryEntityId, page.orgId)
  const candidates: { targetEntityId: string; relationshipType: string; confidence: number | null }[] = relationships.map((r) => ({
    targetEntityId: r.sourceEntityId === primaryEntityId ? r.targetEntityId : r.sourceEntityId,
    relationshipType: r.relationshipType,
    confidence: r.confidence,
  }))

  // highest-confidence relationships first — real ranking, not arbitrary order
  candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))

  const links: Parameters<typeof replaceInternalLinksForPage>[2] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (links.length >= MAX_LINKS_PER_PAGE) break
    if (seen.has(candidate.targetEntityId)) continue
    seen.add(candidate.targetEntityId)

    const targetEntity = await getEntity(candidate.targetEntityId, page.orgId)
    if (!targetEntity) continue
    const targetPage = await getPageForEntity(page.projectId, candidate.targetEntityId, page.orgId)

    links.push({
      orgId: page.orgId,
      projectId: page.projectId,
      sourcePageId: page.id,
      targetPageId: targetPage?.id ?? null,
      targetEntityId: candidate.targetEntityId,
      reason: targetPage
        ? `Related via ${candidate.relationshipType} — "${targetEntity.name}" has its own page.`
        : `Related via ${candidate.relationshipType} — "${targetEntity.name}" does not have a page yet (recommendation only, not rendered as a link).`,
      relationshipType: candidate.relationshipType,
      confidence: candidate.confidence,
    })
  }

  return replaceInternalLinksForPage(page.id, page.orgId, links)
}

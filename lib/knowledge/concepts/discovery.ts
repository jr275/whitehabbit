import "server-only"

/* ================================================================== *
 * DISCOVERY — assembling the reader's "what is this about / what else
 * do I have like it" panel from rows that already exist.
 *
 * This module computes nothing. getConceptsForItem knows what an item
 * is about; findRelatedItems knows what overlaps with it and by how
 * much; explainRelation turns that overlap into a sentence. All this
 * does is put them in one owner-scoped call and shape the result for
 * the wire, so the route stays thin and the mapping stays testable
 * without next/server.
 *
 * NO SECOND RANKING LIVES HERE. It would be easy to re-sort, re-weight
 * or filter "weak" relationships on the way out, and every such tweak
 * would be a ranking rule hidden outside the module that is supposed
 * to own ranking — invisible to related.ts's determinism tests. The
 * order that arrives is the order that ships.
 * ================================================================== */

import {
  emptyDiscovery,
  type DiscoveryResult,
  type ItemConcept,
  type RelatedKnowledgeItem,
} from "@/lib/knowledge/discovery-contract"
import { explainRelation, findRelatedItems } from "./related"
import { getConceptsForItem, type ConceptScope } from "./repo"

/** Six is what the reader's info panel can show without becoming a
 *  second library view. Related is a door, not a destination. */
export const RELATED_LIMIT = 6

/**
 * Everything the reader panel needs for one item, in one owner-scoped
 * pass.
 *
 * An item belonging to someone else returns `not_analyzed` rather than
 * throwing: both queries below are scoped, so another owner's item is
 * simply an item with no concepts, which is indistinguishable from one
 * that has not been analyzed. The route still 404s it first — this is
 * the second line, not the first.
 */
export async function discoverForItem(
  itemId: string,
  scope: ConceptScope,
  limit = RELATED_LIMIT,
): Promise<DiscoveryResult> {
  const rows = await getConceptsForItem(itemId, scope)

  // Nothing is known about this item, so nothing is claimed about it —
  // and crucially we do NOT go looking for related items, because
  // relatedness here is defined entirely by shared concepts. An item
  // with no concepts has no relationships to find, only a query to
  // waste.
  if (rows.length === 0) return emptyDiscovery(itemId, "not_analyzed")

  const concepts: ItemConcept[] = rows.map((r) => ({
    id: r.id,
    label: r.canonical_name,
    type: r.concept_type,
    confidence: r.confidence,
    evidenceCount: r.evidence.length,
  }))

  const related: RelatedKnowledgeItem[] = (await findRelatedItems(itemId, scope, limit)).map((r) => ({
    id: r.itemId,
    title: r.title,
    url: r.url,
    score: r.score,
    why: explainRelation(r),
    shared: r.shared.map((s) => ({ id: s.conceptId, label: s.name, itemCount: s.itemCount })),
  }))

  return { itemId, status: "ready", concepts, related }
}

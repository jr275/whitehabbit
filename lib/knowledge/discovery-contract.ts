/* ================================================================== *
 * DISCOVERY — the wire contract for "what is this about, and what
 * else do I have like it".
 *
 * Not `server-only`: the browser compiles against the same definition
 * the route produces, exactly as research-contract.ts does.
 *
 * WHAT THIS SURFACE IS ALLOWED TO CLAIM. Every field here is derived
 * from rows that already exist — concepts extracted against cited
 * passages (knowledge_item_concepts) and the overlap between them. No
 * part of this response is generated at read time, including `why`,
 * which is assembled from the shared concept names themselves. That
 * constraint is the product: "related" has to be answerable, not just
 * plausible.
 *
 * THREE STATUSES, BECAUSE THE EMPTY CASES ARE NOT THE SAME THING.
 * An item nothing relates to, an item that has not been analyzed yet,
 * and an item that cannot be analyzed at all (a guest-local save with
 * no server row) all render as "nothing here" if they share a status —
 * and the first is a fact about the library while the other two are
 * facts about the pipeline. The UI must be able to say which.
 * ================================================================== */

import type { ConceptType } from "./concepts/normalize"

export type DiscoveryStatus =
  /** Concepts exist for this item. `related` may still be empty — that
   *  is a real answer, not a missing one. */
  | "ready"
  /** No concepts yet: the item is still in the pipeline, or extraction
   *  has not run for it. Nothing is known, so nothing is claimed. */
  | "not_analyzed"
  /** There is no server-side item to analyze (guest mode). */
  | "unavailable"

export interface ItemConcept {
  id: string
  label: string
  type: ConceptType
  /** How central this concept is to THIS item, as the extractor scored
   *  it. Carried through so the UI can order and weight honestly. */
  confidence: number
  /** How many passages of this item were cited as support. Never zero:
   *  the extraction contract rejects a concept with no evidence. */
  evidenceCount: number
}

export interface SharedConceptRef {
  id: string
  label: string
  /** How many items in this library hold the concept. Fewer means more
   *  distinctive, and distinctiveness is what made it worth showing. */
  itemCount: number
}

export interface RelatedKnowledgeItem {
  id: string
  title: string | null
  url: string
  /** Deterministic, and comparable only within one response. */
  score: number
  /** The explanation, built from the shared concepts by
   *  explainRelation(). A sentence a model wrote would be
   *  unfalsifiable; this one can be checked against `shared`. */
  why: string
  shared: SharedConceptRef[]
}

export interface DiscoveryResult {
  itemId: string
  status: DiscoveryStatus
  concepts: ItemConcept[]
  related: RelatedKnowledgeItem[]
}

/** The honest nothing. Used wherever a result must be returned but no
 *  analysis exists to describe — never to stand in for a failure. */
export function emptyDiscovery(itemId: string, status: DiscoveryStatus): DiscoveryResult {
  return { itemId, status, concepts: [], related: [] }
}

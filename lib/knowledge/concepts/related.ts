import "server-only"

/* ================================================================== *
 * RELATED KNOWLEDGE — shared concepts, scored deterministically.
 *
 * "Related to this" without a generative model. Two items are related
 * when they share concepts; the strength is computed from how many,
 * how confidently, and how distinctive those shared concepts are.
 *
 * NO LLM IS CONSULTED HERE, now or later, and that is the point. The
 * system must be able to say WHY two items are related — and the
 * answer is a list of shared concepts with the evidence already stored
 * against each association, not a sentence a model wrote. A generated
 * "these are related because…" would be unfalsifiable and would make
 * the relationship look stronger than the data supports.
 *
 * This is also not a graph. There is no traversal, no transitive
 * relatedness, no stored edges — one query, one hop, computed on read.
 * The smallest thing that makes Related work; a graph can be built on
 * top of these rows later without changing them.
 * ================================================================== */

import { query } from "@/lib/db/client"
import type { ConceptScope } from "./repo"

export interface SharedConcept {
  conceptId: string
  name: string
  /** min(confidence of A's association, confidence of B's) — a link is
   *  only as strong as its weaker end. */
  strength: number
  /** How many items in this library hold the concept. Fewer means more
   *  distinctive, which is what makes it worth mentioning. */
  itemCount: number
}

export interface RelatedItem {
  itemId: string
  title: string | null
  url: string
  /** Deterministic. Comparable within one result set only. */
  score: number
  shared: SharedConcept[]
}

/** Concepts held by more than this share of the library explain
 *  nothing — if almost everything is about "AI", "AI" is not why two
 *  particular items are related. They still count, but their weight
 *  decays, which is the same intuition as IDF without the ceremony. */
function distinctiveness(itemCount: number, libraryItemCount: number): number {
  if (libraryItemCount <= 1 || itemCount <= 0) return 1
  // Frequent concepts fall away smoothly rather than at a cliff, so a
  // concept crossing an arbitrary threshold never flips a result set.
  return Math.log(1 + libraryItemCount / itemCount) / Math.log(1 + libraryItemCount)
}

/**
 * Items sharing concepts with `itemId`, strongest first.
 *
 * One query. The join is inside SQL and scoped on BOTH sides of the
 * relationship — an association row belonging to another owner cannot
 * enter the result even though the concept ids would otherwise match.
 */
export async function findRelatedItems(
  itemId: string,
  scope: ConceptScope,
  limit = 6,
): Promise<RelatedItem[]> {
  const rows = await query<Record<string, unknown>>(
    `WITH mine AS (
       SELECT concept_id, confidence
         FROM knowledge_item_concepts
        WHERE item_id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3
     ),
     library AS (
       SELECT COUNT(*)::int AS n
         FROM knowledge_items
        WHERE org_id = $2 AND created_by IS NOT DISTINCT FROM $3 AND archived = FALSE
     ),
     concept_freq AS (
       SELECT concept_id, COUNT(DISTINCT item_id)::int AS item_count
         FROM knowledge_item_concepts
        WHERE org_id = $2 AND created_by IS NOT DISTINCT FROM $3
        GROUP BY concept_id
     )
     SELECT other.item_id,
            i.title,
            i.url,
            c.id   AS concept_id,
            c.canonical_name,
            LEAST(mine.confidence, other.confidence) AS strength,
            f.item_count,
            (SELECT n FROM library) AS library_count
       FROM mine
       JOIN knowledge_item_concepts other
              ON other.concept_id = mine.concept_id
             AND other.org_id = $2
             AND other.created_by IS NOT DISTINCT FROM $3
             AND other.item_id <> $1
       JOIN knowledge_items i
              ON i.id = other.item_id
             AND i.org_id = $2
             AND i.created_by IS NOT DISTINCT FROM $3
             AND i.archived = FALSE
       JOIN knowledge_concepts c ON c.id = mine.concept_id
       JOIN concept_freq f ON f.concept_id = mine.concept_id`,
    [itemId, scope.orgId, scope.userId],
  )

  const byItem = new Map<string, RelatedItem>()
  for (const r of rows) {
    const id = r.item_id as string
    const libraryCount = Number(r.library_count)
    const itemCount = Number(r.item_count)
    const strength = Number(r.strength)

    const entry =
      byItem.get(id) ??
      ({ itemId: id, title: (r.title as string | null) ?? null, url: r.url as string, score: 0, shared: [] } as RelatedItem)

    entry.shared.push({
      conceptId: r.concept_id as string,
      name: r.canonical_name as string,
      strength,
      itemCount,
    })
    entry.score += strength * distinctiveness(itemCount, libraryCount)
    byItem.set(id, entry)
  }

  for (const entry of byItem.values()) {
    // Name breaks the tie. Without it, two equally-confident shared
    // concepts come back in whatever order the join produced, which
    // makes the ordering — and therefore explainRelation's sentence —
    // vary between identical runs. Determinism is the whole claim this
    // module makes, so it has to hold at the ties too.
    entry.shared.sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name))
    // Rounded so a score is stable to compare and log. The ordering is
    // decided before rounding, so ties here are genuine ties.
    entry.score = Math.round(entry.score * 1000) / 1000
  }

  return [...byItem.values()]
    .sort((a, b) => b.score - a.score || b.shared.length - a.shared.length || a.itemId.localeCompare(b.itemId))
    .slice(0, limit)
}

/**
 * The explanation, built from stored facts rather than generated.
 *
 * Exported because "why are these related?" must be answerable by the
 * same data the ranking used — not by a second, prettier story told
 * separately from it.
 */
export function explainRelation(related: RelatedItem): string {
  const names = related.shared.map((s) => s.name)
  if (names.length === 0) return "No shared concepts."
  if (names.length === 1) return `Both discuss ${names[0]}.`
  const last = names[names.length - 1]
  return `Both discuss ${names.slice(0, -1).join(", ")} and ${last}.`
}

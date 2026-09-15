import "server-only"

/* ================================================================== *
 * LIVE OVERVIEW — the first figures on /knowledge that are the
 * viewer's own.
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN, and why it is the whole
 * point of the file. The surface displays four measures: things saved,
 * concepts, themes and open questions. Two of them exist —
 * knowledge_items and knowledge_item_concepts are real tables with
 * real rows. The other two do not: there is no theme, no clustering of
 * concepts into subjects, and nothing anywhere that derives an open
 * question from a library.
 *
 * So this returns two numbers and says nothing about the other two.
 * Inventing a definition for them here — "a theme is a concept in more
 * than one item", say — would put a number on the page that looks like
 * a measurement and is actually a guess made in a data-access module,
 * and the reader has no way to tell the difference. The surface
 * renders what it is given and omits what it is not.
 *
 * Owner-scoped, like every other read in Knowledge: these are counts
 * of one person's library, not an organization's.
 * ================================================================== */

import { queryOne } from "@/lib/db/client"

export interface LiveOverview {
  savedCount: number
  conceptCount: number
  /** Epoch ms of the earliest save, or null for an empty library —
   *  which is a real state, not a missing value, and the surface has to
   *  render it rather than a date that is not there. */
  since: number | null
}

/**
 * Real counts for one owner's library, in one round trip.
 *
 * Archived items are excluded. Archiving is the user saying "this is
 * no longer part of my library", and a headline count that keeps
 * counting them contradicts every other view in the product — the
 * library list, search, and related knowledge all leave them out.
 *
 * Concepts are counted DISTINCT across the owner's associations rather
 * than as rows: "428 concepts" has to mean 428 different ideas, not
 * one idea found in 428 documents.
 */
export async function liveOverview(scope: { orgId: string; userId: string | null }): Promise<LiveOverview> {
  const row = await queryOne<{ saved: number; concepts: number; since: string | null }>(
    `SELECT
       (SELECT COUNT(*)::int
          FROM knowledge_items
         WHERE org_id = $1 AND created_by IS NOT DISTINCT FROM $2 AND archived = FALSE) AS saved,
       (SELECT COUNT(DISTINCT ic.concept_id)::int
          FROM knowledge_item_concepts ic
          JOIN knowledge_items i
            ON i.id = ic.item_id AND i.archived = FALSE
         WHERE ic.org_id = $1 AND ic.created_by IS NOT DISTINCT FROM $2) AS concepts,
       (SELECT MIN(created_at)::text
          FROM knowledge_items
         WHERE org_id = $1 AND created_by IS NOT DISTINCT FROM $2 AND archived = FALSE) AS since`,
    [scope.orgId, scope.userId],
  )

  return {
    savedCount: row?.saved ?? 0,
    conceptCount: row?.concepts ?? 0,
    since: row?.since != null ? Number(row.since) : null,
  }
}

/* ================================================================== *
 * EXPLORER — the viewer's own concepts and their own saved items.
 *
 * FOUR QUERIES, WHATEVER THE LIBRARY SIZE. Concepts with their counts
 * (one statement), a page of items (one), every item's concepts (one
 * batched), every item's tags (one batched). Nothing here loops over
 * items issuing a query per row, and nothing loops over concepts
 * either — an Explorer that did would be slowest for exactly the
 * people with the most to explore.
 *
 * FILTERING BY CONCEPT HAPPENS ON WHAT WAS ALREADY FETCHED, not by a
 * second round trip: every object already carries the concept ids it
 * was found to contain, because the list needs them to render its
 * chips anyway. A concept_id arriving from a URL therefore selects
 * among rows this scope already proved it owns — it is never itself
 * the authorization for anything.
 * ================================================================== */

import * as repo from "@/lib/knowledge/repo"
import { rowToItem } from "@/lib/knowledge/adapter"
import { getConceptsForItems, listConcepts, type ConceptScope } from "@/lib/knowledge/concepts/repo"
import type { KnowledgeConcept, KnowledgeObject } from "./types"

/** How much of a library one page of the Explorer holds. A ceiling,
 *  not a guess at what people have: the surface says when it is
 *  showing a subset rather than silently presenting part of a library
 *  as the whole of it. */
export const EXPLORER_ITEM_LIMIT = 200
export const EXPLORER_CONCEPT_LIMIT = 60

export interface LiveExplorer {
  concepts: KnowledgeConcept[]
  objects: KnowledgeObject[]
  /** Items in the library beyond the ones returned. */
  total: number
}

export async function liveExplorer(scope: ConceptScope, limit = EXPLORER_ITEM_LIMIT): Promise<LiveExplorer> {
  const [conceptRows, page] = await Promise.all([
    listConcepts(scope, EXPLORER_CONCEPT_LIMIT),
    // Archived items are excluded here for the same reason they are
    // excluded from the headline counts, search and related knowledge:
    // archiving is the user saying this left their library.
    repo.listItems(scope.orgId, scope.userId, { limit, offset: 0, includeArchived: false }),
  ])

  const ids = page.rows.map((r) => r.id)
  const [conceptsByItem, tagsByItem] = await Promise.all([
    getConceptsForItems(ids, scope),
    repo.getTagsForItems(ids, scope.orgId, scope.userId),
  ])

  const concepts: KnowledgeConcept[] = conceptRows.map((c) => ({
    id: c.id,
    label: c.canonical_name,
    itemCount: c.item_count,
    // No themeId: themes are not derived from anything, so a live
    // concept belongs to no theme rather than to an invented one.
  }))

  const objects: KnowledgeObject[] = page.rows.map((row) => {
    const item = rowToItem(row, tagsByItem.get(row.id) ?? [])
    return {
      id: item.id,
      title: item.title,
      source: item.source,
      kind: item.kind,
      savedAt: item.savedAt,
      conceptIds: (conceptsByItem.get(item.id) ?? []).map((c) => c.id),
      url: item.url,
      domain: item.domain,
      author: item.author,
      topics: item.topics,
      // insight, revisits and relevance are deliberately absent — see
      // KnowledgeObject in ./types.ts. Nothing derives them from a real
      // item, and a plausible value is worse than none.
    }
  })

  return { concepts, objects, total: page.total }
}

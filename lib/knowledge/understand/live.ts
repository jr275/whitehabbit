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

import "server-only"

/* ================================================================== *
 * CONCEPT REPOSITORY — every query owner-scoped, in SQL.
 *
 * The predicate is the one the rest of Knowledge already uses:
 *
 *     org_id = $ AND created_by IS NOT DISTINCT FROM $
 *
 * Owner-scoped rather than tenant-scoped, so a colleague in the same
 * organization cannot read or touch these rows either. There is no
 * "get concept by id" without a scope, by construction — the function
 * does not exist, which is stronger than remembering not to call one.
 *
 * IS NOT DISTINCT FROM rather than = because created_by is nullable:
 * a NULL owner matches only a NULL scope, and requireSession() never
 * produces one. Legacy unowned rows are therefore reachable by nobody,
 * which is the correct failure direction.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "@/lib/db/client"
import type { ConceptEvidence, ConceptSource, ExtractedConcept } from "./contract"
import type { ConceptType } from "./normalize"

export interface ConceptRow {
  id: string
  org_id: string
  created_by: string | null
  canonical_name: string
  normalized_name: string
  concept_type: ConceptType
  description: string | null
  created_at: number
  updated_at: number
}

export interface ItemConceptRow {
  id: string
  item_id: string
  concept_id: string
  source: ConceptSource
  confidence: number
  evidence: ConceptEvidence[]
}

export interface ConceptScope {
  orgId: string
  userId: string | null
}

const CONCEPT_COLS = `id, org_id, created_by, canonical_name, normalized_name, concept_type, description, created_at, updated_at`

function toConcept(row: Record<string, unknown>): ConceptRow {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    created_by: (row.created_by as string | null) ?? null,
    canonical_name: row.canonical_name as string,
    normalized_name: row.normalized_name as string,
    concept_type: row.concept_type as ConceptType,
    description: (row.description as string | null) ?? null,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  }
}

/* ---- reads --------------------------------------------------------- */

export async function getConcept(id: string, scope: ConceptScope): Promise<ConceptRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${CONCEPT_COLS} FROM knowledge_concepts
      WHERE id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3`,
    [id, scope.orgId, scope.userId],
  )
  return row ? toConcept(row) : null
}

export async function listConcepts(scope: ConceptScope, limit = 100): Promise<(ConceptRow & { item_count: number })[]> {
  // The count comes from the association table in the same statement.
  // Two round-trips would let the list and its counts disagree, and a
  // per-concept count query would be an N+1 on a page that shows many.
  const rows = await query<Record<string, unknown>>(
    `SELECT c.id, c.org_id, c.created_by, c.canonical_name, c.normalized_name, c.concept_type,
            c.description, c.created_at, c.updated_at,
            COUNT(ic.id)::int AS item_count
       FROM knowledge_concepts c
       LEFT JOIN knowledge_item_concepts ic
              ON ic.concept_id = c.id
             AND ic.org_id = c.org_id
             AND ic.created_by IS NOT DISTINCT FROM c.created_by
      WHERE c.org_id = $1 AND c.created_by IS NOT DISTINCT FROM $2
      GROUP BY c.id
      ORDER BY item_count DESC, c.updated_at DESC
      LIMIT $3`,
    [scope.orgId, scope.userId, limit],
  )
  return rows.map((r) => ({ ...toConcept(r), item_count: Number(r.item_count) }))
}

/** What one item is about. */
export async function getConceptsForItem(
  itemId: string,
  scope: ConceptScope,
): Promise<(ConceptRow & { confidence: number; source: ConceptSource; evidence: ConceptEvidence[] })[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT c.id, c.org_id, c.created_by, c.canonical_name, c.normalized_name, c.concept_type,
            c.description, c.created_at, c.updated_at,
            ic.confidence, ic.source, ic.evidence
       FROM knowledge_item_concepts ic
       JOIN knowledge_concepts c ON c.id = ic.concept_id
      WHERE ic.item_id = $1 AND ic.org_id = $2 AND ic.created_by IS NOT DISTINCT FROM $3
      ORDER BY ic.confidence DESC`,
    [itemId, scope.orgId, scope.userId],
  )
  return rows.map((r) => ({
    ...toConcept(r),
    confidence: Number(r.confidence),
    source: r.source as ConceptSource,
    evidence: (r.evidence as ConceptEvidence[]) ?? [],
  }))
}

/** Batched form — one query for many items, so a list page is not an
 *  N+1. Same lesson as getTagsForItems. */
export async function getConceptsForItems(
  itemIds: string[],
  scope: ConceptScope,
): Promise<Map<string, ConceptRow[]>> {
  const out = new Map<string, ConceptRow[]>()
  if (itemIds.length === 0) return out
  for (const id of itemIds) out.set(id, [])

  const rows = await query<Record<string, unknown>>(
    `SELECT ic.item_id, c.id, c.org_id, c.created_by, c.canonical_name, c.normalized_name,
            c.concept_type, c.description, c.created_at, c.updated_at
       FROM knowledge_item_concepts ic
       JOIN knowledge_concepts c ON c.id = ic.concept_id
      WHERE ic.item_id = ANY($1) AND ic.org_id = $2 AND ic.created_by IS NOT DISTINCT FROM $3
      ORDER BY ic.confidence DESC`,
    [itemIds, scope.orgId, scope.userId],
  )
  for (const r of rows) {
    out.get(r.item_id as string)?.push(toConcept(r))
  }
  return out
}

/* ---- writes -------------------------------------------------------- */

/**
 * Resolves a normalized name to a concept row, creating it if needed.
 *
 * ON CONFLICT rather than SELECT-then-INSERT: two extractions running
 * concurrently for the same owner would otherwise both see "absent"
 * and one would fail on the unique index. The conflict target matches
 * the index in migration 0010 exactly, including the COALESCE — a
 * mismatch there would make the clause silently unreachable.
 */
export async function upsertConcept(
  params: { canonicalName: string; normalizedName: string; type: ConceptType; description?: string | null },
  scope: ConceptScope,
): Promise<ConceptRow> {
  const now = Date.now()
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO knowledge_concepts
       (id, org_id, created_by, canonical_name, normalized_name, concept_type, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     ON CONFLICT (org_id, COALESCE(created_by, ''), normalized_name) DO UPDATE
       SET updated_at = EXCLUDED.updated_at,
           -- Only fill a description that is missing. A later, vaguer
           -- extraction must not overwrite a good one already stored.
           description = COALESCE(knowledge_concepts.description, EXCLUDED.description)
     RETURNING ${CONCEPT_COLS}`,
    [
      `knc_c${randomUUID()}`,
      scope.orgId,
      scope.userId,
      params.canonicalName,
      params.normalizedName,
      params.type,
      params.description ?? null,
      now,
    ],
  )
  return toConcept(row!)
}

/**
 * Writes an item's concepts, replacing whatever was there before.
 *
 * One transaction: a re-extraction that deleted the old associations
 * and then failed would leave an item that reads as "about nothing",
 * which is worse than leaving the previous extraction in place.
 *
 * The item's ownership is verified inside the transaction rather than
 * trusted from the caller — this is the write path an attacker would
 * aim at, and the check has to be on the row being written.
 */
export async function replaceItemConcepts(
  itemId: string,
  concepts: (ExtractedConcept & { source: ConceptSource })[],
  scope: ConceptScope,
): Promise<{ written: number }> {
  return withTransaction(async (client) => {
    const owned = await client.query(
      `SELECT 1 FROM knowledge_items
        WHERE id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3
        FOR UPDATE`,
      [itemId, scope.orgId, scope.userId],
    )
    // Not an error the caller can distinguish from "no such item" — a
    // refusal that says "this exists but is not yours" is itself a
    // disclosure.
    if (owned.rowCount === 0) return { written: 0 }

    await client.query(
      `DELETE FROM knowledge_item_concepts
        WHERE item_id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3`,
      [itemId, scope.orgId, scope.userId],
    )

    const now = Date.now()
    let written = 0
    for (const concept of concepts) {
      const upserted = await client.query<Record<string, unknown>>(
        `INSERT INTO knowledge_concepts
           (id, org_id, created_by, canonical_name, normalized_name, concept_type, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $7)
         ON CONFLICT (org_id, COALESCE(created_by, ''), normalized_name) DO UPDATE
           SET updated_at = EXCLUDED.updated_at
         RETURNING id`,
        [
          `knc_c${randomUUID()}`,
          scope.orgId,
          scope.userId,
          concept.canonicalName,
          concept.normalizedName,
          concept.type,
          now,
        ],
      )
      const conceptId = upserted.rows[0]!.id as string

      await client.query(
        `INSERT INTO knowledge_item_concepts
           (id, item_id, concept_id, org_id, created_by, source, confidence, evidence, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
         ON CONFLICT (item_id, concept_id) DO UPDATE
           SET confidence = EXCLUDED.confidence,
               source     = EXCLUDED.source,
               evidence   = EXCLUDED.evidence`,
        [
          `knc_a${randomUUID()}`,
          itemId,
          conceptId,
          scope.orgId,
          scope.userId,
          concept.source,
          concept.confidence,
          JSON.stringify(concept.evidence),
          now,
        ],
      )
      written += 1
    }

    return { written }
  })
}

import "server-only"

/* ================================================================== *
 * THE TWO RETRIEVERS — one SQL query each, both owner-scoped.
 *
 * Every predicate here carries (org_id, created_by) on the chunk row
 * itself, which is why migration 0007 mirrors ownership onto chunks
 * rather than making retrieval join to reach it. There is no code
 * path in this file that can return a chunk the caller does not own,
 * and no argument that could make one — the scope comes from the
 * session, and the filters cannot widen it.
 * ================================================================== */

import { query } from "@/lib/db/client"
import type { AccessScope, RetrievedChunk, SearchFilters } from "./types"

interface ChunkHitRow {
  chunk_id: string
  item_id: string
  ordinal: number
  text: string
  char_start: number | null
  char_end: number | null
  title: string | null
  site_name: string | null
  domain: string | null
  url: string
  lang: string | null
  published_at: string | number | null
  score: string | number
}

/** The columns and joins both retrievers share, so a change to what a
 *  citation needs happens in one place. */
const HIT_SELECT = `
  c.id            AS chunk_id,
  c.item_id       AS item_id,
  c.ordinal       AS ordinal,
  c.text          AS text,
  c.char_start    AS char_start,
  c.char_end      AS char_end,
  i.title         AS title,
  i.site_name     AS site_name,
  i.domain        AS domain,
  i.url           AS url,
  i.lang          AS lang,
  i.published_at  AS published_at`

function toRetrieved(row: ChunkHitRow, retriever: "lexical" | "semantic"): RetrievedChunk {
  const score = Number(row.score)
  return {
    knowledgeItemId: row.item_id,
    chunkId: row.chunk_id,
    score,
    signals: { [retriever]: score },
    title: row.title,
    source: row.site_name ?? row.domain,
    snippet: row.text,
    ordinal: row.ordinal,
    charStart: row.char_start,
    charEnd: row.char_end,
    metadata: {
      domain: row.domain,
      url: row.url,
      lang: row.lang,
      publishedAt: row.published_at === null ? null : Number(row.published_at),
    },
  }
}

/** Scope + filter predicate, shared so the two retrievers can never
 *  drift on what they consider visible. Returns SQL fragments plus
 *  the parameters they consume, appended to whatever the caller has
 *  already bound. */
function scopeClause(scope: AccessScope, filters: SearchFilters | undefined, params: unknown[]): string {
  params.push(scope.orgId)
  const org = `$${params.length}`
  params.push(scope.userId)
  const user = `$${params.length}`

  let sql = `c.org_id = ${org} AND c.created_by IS NOT DISTINCT FROM ${user}
             AND i.org_id = ${org} AND i.created_by IS NOT DISTINCT FROM ${user}`

  // Archived content is out unless explicitly asked for: it is the
  // user's own "put this away" signal, and answering from it by
  // default would quietly undo that.
  if (!filters?.includeArchived) sql += ` AND i.archived = FALSE`

  if (filters?.itemIds && filters.itemIds.length > 0) {
    params.push(filters.itemIds)
    sql += ` AND c.item_id = ANY($${params.length})`
  }
  return sql
}

/**
 * Lexical retrieval over the tsvector built in migration 0009.
 *
 * plainto_tsquery, not to_tsquery: the input is a user's sentence,
 * and to_tsquery would treat its punctuation as operator syntax and
 * throw on anything it could not parse. plainto_tsquery ANDs the
 * terms, which is the right default for a search box.
 */
export async function lexicalSearch(
  q: string,
  scope: AccessScope,
  limit: number,
  filters?: SearchFilters,
): Promise<RetrievedChunk[]> {
  const params: unknown[] = [q]
  const where = scopeClause(scope, filters, params)
  params.push(limit)

  const rows = await query<ChunkHitRow>(
    `SELECT ${HIT_SELECT},
            ts_rank(c.search_vector, plainto_tsquery('simple', $1)) AS score
       FROM knowledge_chunks c
       JOIN knowledge_items i ON i.id = c.item_id
      WHERE ${where}
        AND c.search_vector @@ plainto_tsquery('simple', $1)
      ORDER BY score DESC, c.item_id, c.ordinal
      LIMIT $${params.length}`,
    params,
  )
  return rows.map((row) => toRetrieved(row, "lexical"))
}

/**
 * Semantic retrieval by cosine distance over the HNSW index.
 *
 * `1 - (embedding <=> query)` turns pgvector's distance into a
 * similarity, so a higher score means closer in this function exactly
 * as it does in the lexical one — two retrievers that disagree about
 * the direction of "better" is a bug waiting to be written.
 *
 * The known weakness, stated rather than hidden: pgvector applies the
 * ownership filter AFTER the index has chosen its neighbours, so a
 * user with few chunks inside a large table can lose recall. The
 * mitigation is to over-fetch (the caller asks for more than it
 * needs) and it is a mitigation, not a fix.
 */
export async function semanticSearch(
  embedding: number[],
  scope: AccessScope,
  limit: number,
  filters?: SearchFilters,
): Promise<RetrievedChunk[]> {
  // pgvector's text input format. Built here rather than passed as an
  // array so the parameter is a single bound value, never interpolated.
  const vector = `[${embedding.join(",")}]`
  const params: unknown[] = [vector]
  const where = scopeClause(scope, filters, params)
  params.push(limit)

  const rows = await query<ChunkHitRow>(
    `SELECT ${HIT_SELECT},
            1 - (e.embedding <=> $1::vector) AS score
       FROM knowledge_chunk_embeddings e
       JOIN knowledge_chunks c ON c.id = e.chunk_id
       JOIN knowledge_items i  ON i.id = c.item_id
      WHERE ${where}
      ORDER BY e.embedding <=> $1::vector
      LIMIT $${params.length}`,
    params,
  )
  return rows.map((row) => toRetrieved(row, "semantic"))
}

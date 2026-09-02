import "server-only"

/* ================================================================== *
 * KNOWLEDGE REPOSITORY — the only place that touches SQL for the
 * Knowledge product. Mirrors lib/db/repo.ts's contract exactly: every
 * function takes an explicit orgId derived from the verified session
 * and filters on it, so one org can never read or mutate another's
 * items — there is deliberately no "get by id alone" path. All SQL is
 * parameterized ($1,$2,…); nothing is string-interpolated.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "@/lib/db/client"
import type { KnowledgeState } from "./types"

export interface KnowledgeRow {
  id: string
  org_id: string
  created_by: string | null
  url: string
  normalized_url: string | null
  canonical_url: string | null
  domain: string | null
  status: string
  kind: string
  error: string | null
  attempts: number
  title: string | null
  author: string | null
  site_name: string | null
  excerpt: string | null
  image_url: string | null
  favicon: string | null
  published_at: string | null
  word_count: number | null
  reading_min: number | null
  lang: string | null
  content_text: string | null
  summary: string | null
  favorite: boolean
  archived: boolean
  read_at: string | null
  created_at: string
  updated_at: string
}

export interface ListOptions {
  limit: number
  offset: number
  /** presentation filters resolved server-side */
  filter?: "all" | "unread" | "read" | "favorites" | "recent"
  kind?: string | null
  includeArchived?: boolean
}

const SELECT_COLS = `id, org_id, created_by, url, normalized_url, canonical_url, domain, status, kind, error, attempts,
  title, author, site_name, excerpt, image_url, favicon, published_at, word_count, reading_min, lang,
  content_text, summary, favorite, archived, read_at, created_at, updated_at`

/** Insert a freshly-saved item in the `saved` state. Content columns
 * stay NULL until the ingestion pipeline fills them from real markup. */
export async function insertSavedItem(params: {
  orgId: string
  userId: string | null
  url: string
  normalizedUrl: string | null
  domain: string | null
}): Promise<KnowledgeRow> {
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, normalized_url, domain, status, kind, attempts, favorite, archived, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'saved', 'article', 0, FALSE, FALSE, $7, $7)`,
    [id, params.orgId, params.userId, params.url, params.normalizedUrl, params.domain, now],
  )
  return (await getItem(id, params.orgId))!
}

/** Find an org's ACTIVE (non-archived) item matching a canonical dedup
 * key, so a re-save of the same page opens the existing item instead of
 * creating a duplicate. Archived items are excluded — re-saving one is a
 * genuine new save. Returns null when nothing matches. */
export async function findByNormalizedUrl(orgId: string, normalizedUrl: string): Promise<KnowledgeRow | null> {
  return queryOne<KnowledgeRow>(
    `SELECT ${SELECT_COLS} FROM knowledge_items
     WHERE org_id = $1 AND normalized_url = $2 AND archived = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [orgId, normalizedUrl],
  )
}

/** Org-scoped single read. Returns null (never another org's row) when
 * the item doesn't belong to orgId. */
export async function getItem(id: string, orgId: string): Promise<KnowledgeRow | null> {
  return queryOne<KnowledgeRow>(`SELECT ${SELECT_COLS} FROM knowledge_items WHERE id = $1 AND org_id = $2`, [id, orgId])
}

export async function listItems(orgId: string, opts: ListOptions): Promise<{ rows: KnowledgeRow[]; total: number }> {
  const where: string[] = ["org_id = $1"]
  const args: unknown[] = [orgId]

  if (!opts.includeArchived) where.push("archived = FALSE")
  if (opts.filter === "favorites") where.push("favorite = TRUE")
  if (opts.filter === "unread") where.push("read_at IS NULL")
  if (opts.filter === "read") where.push("read_at IS NOT NULL")
  if (opts.kind) {
    args.push(opts.kind)
    where.push(`kind = $${args.length}`)
  }

  const whereSql = where.join(" AND ")
  const countRow = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM knowledge_items WHERE ${whereSql}`, args)
  const total = countRow ? Number(countRow.count) : 0

  const limitIdx = args.length + 1
  const offsetIdx = args.length + 2
  const rows = await query<KnowledgeRow>(
    `SELECT ${SELECT_COLS} FROM knowledge_items WHERE ${whereSql} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...args, opts.limit, opts.offset],
  )
  return { rows, total }
}

/**
 * Real full-text-ish search over an org's saved items. Matches the
 * user's query against the actually-extracted fields — title, domain,
 * publication name, excerpt, the full readable body text, and derived
 * tags — with a simple relevance rank (title > source > excerpt/body).
 * Parameterized ILIKE, org-scoped, archived excluded. This is genuine
 * search over persisted content, not a fabricated index; it stays fast
 * at realistic per-org volumes and can be swapped for Postgres FTS or
 * pgvector later without changing the API or UI contract.
 */
export async function searchItems(orgId: string, rawQuery: string, limit = 20): Promise<KnowledgeRow[]> {
  const q = rawQuery.trim()
  if (!q) return []
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
  return query<KnowledgeRow>(
    `SELECT ${SELECT_COLS},
       (CASE
          WHEN title ILIKE $2 THEN 4
          WHEN domain ILIKE $2 OR site_name ILIKE $2 THEN 3
          WHEN excerpt ILIKE $2 THEN 2
          ELSE 1
        END) AS rank
     FROM knowledge_items
     WHERE org_id = $1
       AND archived = FALSE
       AND (
         title ILIKE $2 OR domain ILIKE $2 OR site_name ILIKE $2
         OR excerpt ILIKE $2 OR content_text ILIKE $2 OR author ILIKE $2
         OR id IN (SELECT item_id FROM knowledge_item_tags WHERE org_id = $1 AND tag ILIKE $2)
       )
     ORDER BY rank DESC, created_at DESC
     LIMIT $3`,
    [orgId, like, limit],
  )
}

/** Advance lifecycle state. Used by the ingestion pipeline as it moves
 * saved → fetching → extracting. Org-scoped so a stale/forged id can't
 * mutate another org's row. */
export async function setStatus(id: string, orgId: string, status: KnowledgeState, error?: string | null): Promise<void> {
  await query("UPDATE knowledge_items SET status = $1, error = $2, updated_at = $3 WHERE id = $4 AND org_id = $5", [
    status,
    error ?? null,
    Date.now(),
    id,
    orgId,
  ])
}

export async function incrementAttempts(id: string, orgId: string): Promise<void> {
  await query("UPDATE knowledge_items SET attempts = attempts + 1, updated_at = $1 WHERE id = $2 AND org_id = $3", [Date.now(), id, orgId])
}

export interface ExtractionPatch {
  status: KnowledgeState
  kind: string
  title: string | null
  author: string | null
  siteName: string | null
  excerpt: string | null
  imageUrl: string | null
  favicon: string | null
  canonicalUrl: string | null
  publishedAt: number | null
  wordCount: number | null
  readingMin: number | null
  lang: string | null
  contentText: string | null
  rawHtml: string | null
  tags: string[]
}

/** Persist a completed extraction and its derived tags atomically, and
 * archive the raw HTML so a future re-extraction needs no re-fetch. */
export async function saveExtraction(id: string, orgId: string, patch: ExtractionPatch): Promise<void> {
  const now = Date.now()
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE knowledge_items SET
         status = $1, kind = $2, title = $3, author = $4, site_name = $5, excerpt = $6,
         image_url = $7, favicon = $8, canonical_url = $9, published_at = $10, word_count = $11, reading_min = $12,
         lang = $13, content_text = $14, raw_html = $15, raw_fetched_at = $16, error = NULL, updated_at = $16
       WHERE id = $17 AND org_id = $18`,
      [
        patch.status,
        patch.kind,
        patch.title,
        patch.author,
        patch.siteName,
        patch.excerpt,
        patch.imageUrl,
        patch.favicon,
        patch.canonicalUrl,
        patch.publishedAt,
        patch.wordCount,
        patch.readingMin,
        patch.lang,
        patch.contentText,
        patch.rawHtml,
        now,
        id,
        orgId,
      ],
    )
    await client.query("DELETE FROM knowledge_item_tags WHERE item_id = $1 AND org_id = $2", [id, orgId])
    for (const tag of patch.tags) {
      await client.query(
        "INSERT INTO knowledge_item_tags (item_id, org_id, tag) VALUES ($1, $2, $3) ON CONFLICT (item_id, tag) DO NOTHING",
        [id, orgId, tag.slice(0, 60)],
      )
    }
  })
}

export async function getTags(id: string, orgId: string): Promise<string[]> {
  const rows = await query<{ tag: string }>("SELECT tag FROM knowledge_item_tags WHERE item_id = $1 AND org_id = $2 ORDER BY tag", [id, orgId])
  return rows.map((r) => r.tag)
}

/** Tags across all of an org's items, with counts — powers the Topics
 * surface as a real read (not fabricated). */
export async function listTagCounts(orgId: string, limit = 40): Promise<{ tag: string; count: number }[]> {
  const rows = await query<{ tag: string; count: string }>(
    `SELECT t.tag, COUNT(*)::int AS count
     FROM knowledge_item_tags t
     JOIN knowledge_items i ON i.id = t.item_id
     WHERE t.org_id = $1 AND i.archived = FALSE
     GROUP BY t.tag ORDER BY count DESC, t.tag ASC LIMIT $2`,
    [orgId, limit],
  )
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }))
}

export async function setFavorite(id: string, orgId: string, favorite: boolean): Promise<KnowledgeRow | null> {
  await query("UPDATE knowledge_items SET favorite = $1, updated_at = $2 WHERE id = $3 AND org_id = $4", [favorite, Date.now(), id, orgId])
  return getItem(id, orgId)
}

export async function setArchived(id: string, orgId: string, archived: boolean): Promise<KnowledgeRow | null> {
  await query("UPDATE knowledge_items SET archived = $1, updated_at = $2 WHERE id = $3 AND org_id = $4", [archived, Date.now(), id, orgId])
  return getItem(id, orgId)
}

export async function markRead(id: string, orgId: string): Promise<void> {
  // only set the first time — read_at is "first opened", not "last opened"
  await query("UPDATE knowledge_items SET read_at = $1, updated_at = $1 WHERE id = $2 AND org_id = $3 AND read_at IS NULL", [Date.now(), id, orgId])
}

export async function deleteItem(id: string, orgId: string): Promise<boolean> {
  const rows = await query("DELETE FROM knowledge_items WHERE id = $1 AND org_id = $2 RETURNING id", [id, orgId])
  return rows.length > 0
}

/** Count of items saved by an org since a timestamp — the "you saved N
 * things this week" hero stat, a real aggregate. */
export async function countSavedSince(orgId: string, since: number): Promise<number> {
  const row = await queryOne<{ count: string }>("SELECT COUNT(*)::int AS count FROM knowledge_items WHERE org_id = $1 AND created_at >= $2", [orgId, since])
  return row ? Number(row.count) : 0
}

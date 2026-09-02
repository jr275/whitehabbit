import "server-only"

/* ================================================================== *
 * KNOWLEDGE REPOSITORY — the only place that touches SQL for the
 * Knowledge product. Mirrors lib/db/repo.ts's contract exactly: every
 * function takes an explicit orgId derived from the verified session
 * and filters on it, so one org can never read or mutate another's
 * items — there is deliberately no "get by id alone" path. All SQL is
 * parameterized ($1,$2,…); nothing is string-interpolated.
 *
 * OWNERSHIP (S5): the library is private per USER, not shared across
 * an organization. org_id still decides tenant isolation (one org can
 * never reach another's rows); created_by decides the item's actual
 * owner within that org. Every function that reads, updates or deletes
 * a specific item takes BOTH orgId and userId and puts BOTH in its own
 * WHERE clause — not just in whatever called it — so ownership can
 * never be bypassed by a caller that forgot to check first. A row that
 * exists but belongs to a different user in the same org comes back
 * exactly like a row that doesn't exist: null, or zero rows affected.
 * Callers already treat "not found" as 404 (see lib/api-error.ts's
 * NotFoundError — "never confirm another tenant's resource exists"),
 * so that same, already-correct behavior now also covers another
 * member of your own org, with no new error path needed.
 *
 * knowledge_item_tags has no created_by column of its own (and this
 * commit adds none — see the migration note in the commit message);
 * every tag query enforces ownership by joining back to
 * knowledge_items.created_by, the one place that fact is recorded.
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
 * stay NULL until the ingestion pipeline fills them from real markup.
 * userId becomes the item's owner (created_by) — the only write path
 * that sets it, and it is never reassigned afterward. */
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
  // A fresh row always belongs to the user who just created it — read
  // it back through the same owner-scoped path everything else uses,
  // rather than a separate unscoped lookup.
  return (await getItem(id, params.orgId, params.userId))!
}

/** Find the CALLING USER's ACTIVE (non-archived) item matching a
 * canonical dedup key, so a re-save of the same page opens the existing
 * item instead of creating a duplicate. Archived items are excluded — a
 * genuine new save. Scoped by (org, user): two colleagues who save the
 * same public page each get their OWN item — a duplicate match must
 * never resolve to a row the caller cannot open, which would otherwise
 * hand back another user's title/excerpt/cover in the very save
 * response that was supposed to be theirs. */
export async function findByNormalizedUrl(orgId: string, userId: string | null, normalizedUrl: string): Promise<KnowledgeRow | null> {
  return queryOne<KnowledgeRow>(
    `SELECT ${SELECT_COLS} FROM knowledge_items
     WHERE org_id = $1 AND created_by IS NOT DISTINCT FROM $2 AND normalized_url = $3 AND archived = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [orgId, userId, normalizedUrl],
  )
}

/** Owner-scoped single read. Returns null — indistinguishable from a
 * nonexistent id — for another org's row AND for another user's row in
 * the SAME org (S5). */
export async function getItem(id: string, orgId: string, userId: string | null): Promise<KnowledgeRow | null> {
  return queryOne<KnowledgeRow>(
    `SELECT ${SELECT_COLS} FROM knowledge_items WHERE id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3`,
    [id, orgId, userId],
  )
}

export async function listItems(orgId: string, userId: string | null, opts: ListOptions): Promise<{ rows: KnowledgeRow[]; total: number }> {
  const where: string[] = ["org_id = $1", "created_by IS NOT DISTINCT FROM $2"]
  const args: unknown[] = [orgId, userId]

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
 * Real full-text-ish search over the CALLING USER's own saved items
 * (S5 — search must never surface another user's content, in the same
 * org or not). Matches the user's query against the actually-extracted
 * fields — title, domain, publication name, excerpt, the full readable
 * body text, and derived tags — with a simple relevance rank (title >
 * source > excerpt/body). Parameterized ILIKE, owner-scoped, archived
 * excluded. This is genuine search over persisted content, not a
 * fabricated index; it stays fast at realistic per-user volumes and can
 * be swapped for Postgres FTS or pgvector later without changing the
 * API or UI contract.
 */
export async function searchItems(orgId: string, userId: string | null, rawQuery: string, limit = 20): Promise<KnowledgeRow[]> {
  const q = rawQuery.trim()
  if (!q) return []
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
  return query<KnowledgeRow>(
    `SELECT ${SELECT_COLS},
       (CASE
          WHEN title ILIKE $3 THEN 4
          WHEN domain ILIKE $3 OR site_name ILIKE $3 THEN 3
          WHEN excerpt ILIKE $3 THEN 2
          ELSE 1
        END) AS rank
     FROM knowledge_items
     WHERE org_id = $1
       AND created_by IS NOT DISTINCT FROM $2
       AND archived = FALSE
       AND (
         title ILIKE $3 OR domain ILIKE $3 OR site_name ILIKE $3
         OR excerpt ILIKE $3 OR content_text ILIKE $3 OR author ILIKE $3
         OR id IN (
           SELECT item_id FROM knowledge_item_tags
           WHERE org_id = $1 AND tag ILIKE $3
             AND item_id IN (SELECT id FROM knowledge_items WHERE org_id = $1 AND created_by IS NOT DISTINCT FROM $2)
         )
       )
     ORDER BY rank DESC, created_at DESC
     LIMIT $4`,
    [orgId, userId, like, limit],
  )
}

/** Advance lifecycle state. Used by the ingestion pipeline as it moves
 * saved → fetching → extracting. Owner-scoped so a stale/forged id
 * can't mutate another org's OR another user's row. */
export async function setStatus(id: string, orgId: string, userId: string | null, status: KnowledgeState, error?: string | null): Promise<void> {
  await query("UPDATE knowledge_items SET status = $1, error = $2, updated_at = $3 WHERE id = $4 AND org_id = $5 AND created_by IS NOT DISTINCT FROM $6", [
    status,
    error ?? null,
    Date.now(),
    id,
    orgId,
    userId,
  ])
}

export async function incrementAttempts(id: string, orgId: string, userId: string | null): Promise<void> {
  await query("UPDATE knowledge_items SET attempts = attempts + 1, updated_at = $1 WHERE id = $2 AND org_id = $3 AND created_by IS NOT DISTINCT FROM $4", [
    Date.now(),
    id,
    orgId,
    userId,
  ])
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
 * archive the raw HTML so a future re-extraction needs no re-fetch.
 * Owner-scoped: if the item row does not belong to (orgId, userId) the
 * UPDATE affects zero rows, and the tag rewrite that follows is skipped
 * entirely rather than mutating tags for an item this call never
 * actually touched — the tag write is not a separate trust boundary
 * from the item write it is always paired with. */
export async function saveExtraction(id: string, orgId: string, userId: string | null, patch: ExtractionPatch): Promise<void> {
  const now = Date.now()
  await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE knowledge_items SET
         status = $1, kind = $2, title = $3, author = $4, site_name = $5, excerpt = $6,
         image_url = $7, favicon = $8, canonical_url = $9, published_at = $10, word_count = $11, reading_min = $12,
         lang = $13, content_text = $14, raw_html = $15, raw_fetched_at = $16, error = NULL, updated_at = $16
       WHERE id = $17 AND org_id = $18 AND created_by IS NOT DISTINCT FROM $19`,
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
        userId,
      ],
    )
    if ((updated.rowCount ?? 0) === 0) return

    await client.query("DELETE FROM knowledge_item_tags WHERE item_id = $1 AND org_id = $2", [id, orgId])
    for (const tag of patch.tags) {
      await client.query(
        "INSERT INTO knowledge_item_tags (item_id, org_id, tag) VALUES ($1, $2, $3) ON CONFLICT (item_id, tag) DO NOTHING",
        [id, orgId, tag.slice(0, 60)],
      )
    }
  })
}

/** Owner-scoped via a join back to knowledge_items.created_by —
 * knowledge_item_tags has no owner column of its own, so this is where
 * that fact is enforced for every tag read (S5: tags are a lateral path
 * to another user's item and must be closed the same as the item
 * itself). */
export async function getTags(id: string, orgId: string, userId: string | null): Promise<string[]> {
  const rows = await query<{ tag: string }>(
    `SELECT t.tag FROM knowledge_item_tags t
     JOIN knowledge_items i ON i.id = t.item_id
     WHERE t.item_id = $1 AND t.org_id = $2 AND i.created_by IS NOT DISTINCT FROM $3
     ORDER BY t.tag`,
    [id, orgId, userId],
  )
  return rows.map((r) => r.tag)
}

/** Tags across the CALLING USER's own items, with counts — powers the
 * Topics surface as a real read (not fabricated) of what THIS user has
 * saved, never the whole org's aggregate (S5). */
export async function listTagCounts(orgId: string, userId: string | null, limit = 40): Promise<{ tag: string; count: number }[]> {
  const rows = await query<{ tag: string; count: string }>(
    `SELECT t.tag, COUNT(*)::int AS count
     FROM knowledge_item_tags t
     JOIN knowledge_items i ON i.id = t.item_id
     WHERE t.org_id = $1 AND i.created_by IS NOT DISTINCT FROM $2 AND i.archived = FALSE
     GROUP BY t.tag ORDER BY count DESC, t.tag ASC LIMIT $3`,
    [orgId, userId, limit],
  )
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }))
}

export async function setFavorite(id: string, orgId: string, userId: string | null, favorite: boolean): Promise<KnowledgeRow | null> {
  await query("UPDATE knowledge_items SET favorite = $1, updated_at = $2 WHERE id = $3 AND org_id = $4 AND created_by IS NOT DISTINCT FROM $5", [
    favorite,
    Date.now(),
    id,
    orgId,
    userId,
  ])
  return getItem(id, orgId, userId)
}

export async function setArchived(id: string, orgId: string, userId: string | null, archived: boolean): Promise<KnowledgeRow | null> {
  await query("UPDATE knowledge_items SET archived = $1, updated_at = $2 WHERE id = $3 AND org_id = $4 AND created_by IS NOT DISTINCT FROM $5", [
    archived,
    Date.now(),
    id,
    orgId,
    userId,
  ])
  return getItem(id, orgId, userId)
}

export async function markRead(id: string, orgId: string, userId: string | null): Promise<void> {
  // only set the first time — read_at is "first opened", not "last opened"
  await query(
    "UPDATE knowledge_items SET read_at = $1, updated_at = $1 WHERE id = $2 AND org_id = $3 AND created_by IS NOT DISTINCT FROM $4 AND read_at IS NULL",
    [Date.now(), id, orgId, userId],
  )
}

export async function deleteItem(id: string, orgId: string, userId: string | null): Promise<boolean> {
  const rows = await query("DELETE FROM knowledge_items WHERE id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3 RETURNING id", [
    id,
    orgId,
    userId,
  ])
  return rows.length > 0
}

/** Count of items the CALLING USER saved since a timestamp — the "you
 * saved N things this week" hero stat, a real aggregate of THEIR own
 * library, never the whole org's (S5). */
export async function countSavedSince(orgId: string, userId: string | null, since: number): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM knowledge_items WHERE org_id = $1 AND created_by IS NOT DISTINCT FROM $2 AND created_at >= $3",
    [orgId, userId, since],
  )
  return row ? Number(row.count) : 0
}

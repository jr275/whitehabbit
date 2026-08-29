import "server-only"

/* ================================================================== *
 * SAVED ITEMS REPOSITORY — every read and write is org-scoped.
 *
 * The rule this module exists to make unbreakable: there is no
 * "get item by id" function. Every exported function takes `orgId` as
 * its first parameter and every statement filters on it. A caller
 * cannot accidentally reach another tenant's row, because no function
 * signature lets them ask for one.
 *
 * This mirrors the convention lib/db/repo.ts already established for
 * Workers, and reuses that layer's pooled client, parameterized
 * `query`/`queryOne` helpers and `withTransaction` rather than
 * standing up a second data-access stack.
 *
 * Belt and braces: the database ALSO enforces this. Every child table
 * references saved_items(id, org_id) as a composite foreign key, so a
 * cross-tenant row cannot be written even if a predicate here were
 * ever dropped. See migrations/0002_pocket2.sql.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "@/lib/db/client"
import {
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
  type ContentType, type IngestStatus, type ItemStatus, type LibraryQuery,
  type Page, type ReaderStatus, type SavedItem, type SavedItemState, type SavedItemView,
} from "@/lib/pocket2/domain/types"
import { resolveDateFloor } from "@/lib/pocket2/domain/validate"
import { canonicalizeUrl, faviconForDomain, titleFromUrl } from "@/lib/pocket2/domain/url"

/* ---- row shapes + mappers ---------------------------------------- */

interface ItemRow {
  id: string
  org_id: string
  created_by: string | null
  url: string
  canonical_url: string
  domain: string
  title: string | null
  description: string | null
  author: string | null
  content_type: string
  image_url: string | null
  favicon_url: string | null
  published_at: string | null
  saved_at: string
  word_count: number | null
  reading_time_seconds: number | null
  ingest_status: string
  ingest_error: string | null
  ingest_attempts: number
  reader_status: string
  created_at: string
  updated_at: string
}

/** node-postgres returns BIGINT as a string to avoid silent precision
 * loss. Every timestamp therefore crosses this boundary exactly once,
 * here — no other layer converts dates. */
const num = (v: string | null): number | null => (v === null ? null : Number(v))

function rowToItem(r: ItemRow): SavedItem {
  return {
    id: r.id,
    orgId: r.org_id,
    createdBy: r.created_by,
    url: r.url,
    canonicalUrl: r.canonical_url,
    domain: r.domain,
    title: r.title,
    description: r.description,
    author: r.author,
    contentType: r.content_type as ContentType,
    imageUrl: r.image_url,
    faviconUrl: r.favicon_url,
    publishedAt: num(r.published_at),
    savedAt: Number(r.saved_at),
    wordCount: r.word_count,
    readingTimeSeconds: r.reading_time_seconds,
    ingestStatus: r.ingest_status as IngestStatus,
    ingestError: r.ingest_error,
    ingestAttempts: r.ingest_attempts,
    readerStatus: r.reader_status as ReaderStatus,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

interface StateRow {
  item_id: string
  user_id: string
  org_id: string
  status: string
  is_favorite: boolean
  read_at: string | null
  archived_at: string | null
  favorited_at: string | null
  reading_progress: number
  reading_segment_id: string | null
  listening_position_ms: number | null
  listening_segment_id: string | null
  playback_speed: number
  listen_completed: boolean
}

function rowToState(r: StateRow): SavedItemState {
  return {
    itemId: r.item_id,
    userId: r.user_id,
    orgId: r.org_id,
    status: r.status as ItemStatus,
    isFavorite: r.is_favorite,
    readAt: num(r.read_at),
    archivedAt: num(r.archived_at),
    favoritedAt: num(r.favorited_at),
    readingProgress: r.reading_progress,
    readingSegmentId: r.reading_segment_id,
    listeningPositionMs: r.listening_position_ms,
    listeningSegmentId: r.listening_segment_id,
    playbackSpeed: r.playback_speed,
    listenCompleted: r.listen_completed,
  }
}

const ITEM_COLUMNS = `
  i.id, i.org_id, i.created_by, i.url, i.canonical_url, i.domain, i.title,
  i.description, i.author, i.content_type, i.image_url, i.favicon_url,
  i.published_at, i.saved_at, i.word_count, i.reading_time_seconds,
  i.ingest_status, i.ingest_error, i.ingest_attempts, i.reader_status,
  i.created_at, i.updated_at`

/* ---- create (idempotent) ------------------------------------------ */

export interface SaveResult {
  item: SavedItem
  /** true when this URL was already in the organization's library.
   * The caller shows a "already saved" affordance rather than
   * creating a second row — see the duplicate UX in the product brief. */
  duplicate: boolean
}

/**
 * Save a URL. Idempotent per (org, canonical URL).
 *
 * Idempotency is delegated to the database's unique index rather than
 * implemented as a read-then-write in application code: two
 * simultaneous saves of the same link from two devices would both
 * pass a read-first check and then race. `ON CONFLICT DO NOTHING`
 * cannot.
 *
 * Deliberately does NO network I/O. Metadata arrives later via the
 * ingestion job this enqueues, so the request returns immediately and
 * the user sees a real row — honestly marked `pending` — rather than
 * waiting on someone else's web server.
 */
export async function saveItem(
  orgId: string,
  userId: string,
  rawUrl: string,
  opts: { title?: string | null } = {},
): Promise<SaveResult> {
  const { original, canonical, hash, domain } = canonicalizeUrl(rawUrl)
  const now = Date.now()
  const id = `item_${randomUUID()}`

  return withTransaction(async (client) => {
    const inserted = await client.query<ItemRow>(
      `INSERT INTO saved_items (
         id, org_id, created_by, url, canonical_url, url_hash, domain,
         title, content_type, favicon_url, saved_at, ingest_status,
         reader_status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unknown',$9,$10,'pending','not_available',$10,$10)
       ON CONFLICT (org_id, url_hash) DO NOTHING
       RETURNING ${ITEM_COLUMNS.replace(/i\./g, "")}`,
      [id, orgId, userId, original, canonical, hash, domain,
       opts.title?.trim() || titleFromUrl(canonical), faviconForDomain(domain), now],
    )

    if (inserted.rows.length === 0) {
      // Lost the race, or a genuine re-save. Either way the correct
      // answer is the row that already exists — scoped to this org, so
      // a URL saved by another tenant is never returned here.
      const existing = await client.query<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM saved_items i WHERE i.org_id = $1 AND i.url_hash = $2`,
        [orgId, hash],
      )
      return { item: rowToItem(existing.rows[0]), duplicate: true }
    }

    const item = rowToItem(inserted.rows[0])

    // The per-user state row exists from the moment of saving, so
    // "unread" is a real stored fact rather than an absence inferred
    // by every query that touches it.
    await client.query(
      `INSERT INTO saved_item_states (item_id, user_id, org_id, status, created_at, updated_at)
       VALUES ($1,$2,$3,'unread',$4,$4) ON CONFLICT DO NOTHING`,
      [item.id, userId, orgId, now],
    )

    await client.query(
      `INSERT INTO ingest_jobs (id, item_id, org_id, kind, status, next_attempt_at, payload, created_at, updated_at)
       VALUES ($1,$2,$3,'metadata','queued',$4,$5::jsonb,$4,$4)`,
      [`job_${randomUUID()}`, item.id, orgId, now, JSON.stringify({ url: canonical })],
    )

    await client.query(
      `INSERT INTO item_events (id, org_id, item_id, user_id, type, payload, occurred_at)
       VALUES ($1,$2,$3,$4,'saved',$5::jsonb,$6)`,
      [`ev_${randomUUID()}`, orgId, item.id, userId, JSON.stringify({ domain }), now],
    )

    return { item, duplicate: false }
  })
}

/* ---- read --------------------------------------------------------- */

/** Returns null for an item in another organization — indistinguishable
 * from one that does not exist. The route layer turns null into 404,
 * so cross-tenant probing cannot confirm a resource exists. */
export async function getItem(orgId: string, userId: string, itemId: string): Promise<SavedItemView | null> {
  const row = await queryOne<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM saved_items i WHERE i.id = $1 AND i.org_id = $2`,
    [itemId, orgId],
  )
  if (!row) return null
  const [view] = await decorate(orgId, userId, [rowToItem(row)])
  return view
}

/** Attaches per-user state, tags and collections to a page of items in
 * two fixed queries, regardless of page size — never one query per
 * card. Joining these into the main statement instead would multiply
 * rows and break keyset pagination's LIMIT. */
async function decorate(orgId: string, userId: string, items: SavedItem[]): Promise<SavedItemView[]> {
  if (items.length === 0) return []
  const ids = items.map((i) => i.id)

  const [states, labels] = await Promise.all([
    query<StateRow>(
      `SELECT * FROM saved_item_states WHERE org_id = $1 AND user_id = $2 AND item_id = ANY($3::text[])`,
      [orgId, userId, ids],
    ),
    query<{ item_id: string; kind: string; id: string; name: string; slug: string }>(
      `SELECT sit.item_id, 'tag' AS kind, t.id, t.name, t.slug
         FROM saved_item_tags sit JOIN tags t ON t.id = sit.tag_id AND t.org_id = sit.org_id
        WHERE sit.org_id = $1 AND sit.item_id = ANY($2::text[])
       UNION ALL
       SELECT ci.item_id, 'collection' AS kind, c.id, c.name, c.slug
         FROM collection_items ci JOIN collections c ON c.id = ci.collection_id AND c.org_id = ci.org_id
        WHERE ci.org_id = $1 AND ci.item_id = ANY($2::text[])`,
      [orgId, ids],
    ),
  ])

  const stateByItem = new Map(states.map((s) => [s.item_id, rowToState(s)]))
  const tagsByItem = new Map<string, { id: string; name: string; slug: string }[]>()
  const collsByItem = new Map<string, { id: string; name: string; slug: string }[]>()
  for (const row of labels) {
    const target = row.kind === "tag" ? tagsByItem : collsByItem
    const list = target.get(row.item_id) ?? []
    list.push({ id: row.id, name: row.name, slug: row.slug })
    target.set(row.item_id, list)
  }

  return items.map((item) => ({
    ...item,
    state: stateByItem.get(item.id) ?? null,
    tags: tagsByItem.get(item.id) ?? [],
    collections: collsByItem.get(item.id) ?? [],
  }))
}

/* ---- list: filters, search, keyset pagination ---------------------- */

/** Each sort maps to a single expression, so the ORDER BY and the
 * cursor predicate are always derived from the same definition and
 * cannot drift apart. */
const SORTS = {
  newest:       { expr: "i.saved_at",                              dir: "DESC", cast: "bigint" },
  oldest:       { expr: "i.saved_at",                              dir: "ASC",  cast: "bigint" },
  title:        { expr: "lower(coalesce(i.title, ''))",            dir: "ASC",  cast: "text" },
  reading_time: { expr: "coalesce(i.reading_time_seconds, 0)",     dir: "DESC", cast: "int" },
  domain:       { expr: "i.domain",                                dir: "ASC",  cast: "text" },
} as const

function encodeCursor(sortValue: string, id: string): string {
  return Buffer.from(JSON.stringify([sortValue, id]), "utf8").toString("base64url")
}

/** A malformed cursor returns the first page rather than throwing: a
 * stale or truncated link should still show the library. */
function decodeCursor(cursor: string): [string, string] | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((v) => typeof v === "string")) {
      return parsed as [string, string]
    }
  } catch {
    /* fall through */
  }
  return null
}

export async function listItems(orgId: string, userId: string, q: LibraryQuery): Promise<Page<SavedItemView>> {
  const params: unknown[] = [orgId, userId]
  const where: string[] = ["i.org_id = $1"]
  const p = (value: unknown): string => `$${params.push(value)}`

  // Per-user state is LEFT JOINed: an item with no state row yet is
  // unread and not favorited, and must still appear.
  const joins = [`LEFT JOIN saved_item_states s ON s.item_id = i.id AND s.org_id = i.org_id AND s.user_id = $2`]

  switch (q.status) {
    case "unread":   where.push("coalesce(s.status, 'unread') = 'unread'"); break
    case "read":     where.push("s.status = 'read'"); break
    case "archived": where.push("s.status = 'archived'"); break
    case "favorite": where.push("s.is_favorite = TRUE AND coalesce(s.status, 'unread') <> 'archived'"); break
    default:
      // "All items" means the active library. Archived items are not
      // deleted, but they are out of the way until asked for.
      where.push("coalesce(s.status, 'unread') <> 'archived'")
  }

  if (q.contentTypes?.length) where.push(`i.content_type = ANY(${p(q.contentTypes)}::text[])`)
  if (q.domains?.length) where.push(`i.domain = ANY(${p(q.domains)}::text[])`)

  const floor = q.dateRange === "custom" ? q.dateFrom : resolveDateFloor(q.dateRange ?? "all")
  if (floor) where.push(`i.saved_at >= ${p(floor)}::bigint`)
  if (q.dateRange === "custom" && q.dateTo) where.push(`i.saved_at <= ${p(q.dateTo)}::bigint`)

  // Multiple tags narrow (AND), matching how people actually refine a
  // search: "ai" AND "research", not "either".
  if (q.tagSlugs?.length) {
    where.push(`(SELECT count(DISTINCT t.slug) FROM saved_item_tags sit
                   JOIN tags t ON t.id = sit.tag_id AND t.org_id = sit.org_id
                  WHERE sit.item_id = i.id AND sit.org_id = i.org_id
                    AND t.slug = ANY(${p(q.tagSlugs)}::text[])) = ${p(q.tagSlugs.length)}::bigint`)
  }

  if (q.collectionSlug) {
    where.push(`EXISTS (SELECT 1 FROM collection_items ci
                          JOIN collections c ON c.id = ci.collection_id AND c.org_id = ci.org_id
                         WHERE ci.item_id = i.id AND ci.org_id = i.org_id AND c.slug = ${p(q.collectionSlug)})`)
  }

  // Full-text over the weighted item vector plus the reader body.
  // websearch_to_tsquery accepts what a person actually types
  // (quoted phrases, OR, -exclusion) without throwing on syntax.
  let rankExpr: string | null = null
  if (q.search) {
    const tsq = p(q.search)
    rankExpr = `ts_rank_cd(i.search_vector, websearch_to_tsquery('english', ${tsq}))`
    where.push(`(
      i.search_vector @@ websearch_to_tsquery('english', ${tsq})
      OR i.title ILIKE ${p(`%${q.search}%`)}
      OR EXISTS (SELECT 1 FROM reader_documents rd
                  WHERE rd.item_id = i.id AND rd.org_id = i.org_id
                    AND rd.search_vector @@ websearch_to_tsquery('english', ${tsq}))
    )`)
  }

  const sort = SORTS[q.sort ?? "newest"]
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

  // Keyset, never OFFSET: page N costs the same as page 1, and rows
  // saved while the user is paging cannot shift the window and cause
  // an item to be skipped or repeated.
  if (q.cursor) {
    const decoded = decodeCursor(q.cursor)
    if (decoded) {
      const comparison = sort.dir === "DESC" ? "<" : ">"
      where.push(`(${sort.expr}, i.id) ${comparison} (${p(decoded[0])}::${sort.cast}, ${p(decoded[1])}::text)`)
    }
  }

  // Relevance leads when the user is searching; their chosen sort is
  // the tie-breaker. Sorting a search purely by date buries the best
  // match, which is the most common complaint about "instant" search.
  const orderBy = rankExpr && !q.cursor
    ? `${rankExpr} DESC, ${sort.expr} ${sort.dir}, i.id ${sort.dir}`
    : `${sort.expr} ${sort.dir}, i.id ${sort.dir}`

  const rows = await query<ItemRow & { cursor_value: string }>(
    `SELECT ${ITEM_COLUMNS}, (${sort.expr})::text AS cursor_value
       FROM saved_items i
       ${joins.join("\n       ")}
      WHERE ${where.join("\n        AND ")}
      ORDER BY ${orderBy}
      LIMIT ${p(limit + 1)}`,
    params,
  )

  // Fetch one extra row to know whether another page exists, without
  // a second COUNT(*) over the whole filtered set.
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const last = pageRows[pageRows.length - 1]

  return {
    items: await decorate(orgId, userId, pageRows.map(rowToItem)),
    nextCursor: hasMore && last ? encodeCursor(last.cursor_value, last.id) : null,
    hasMore,
  }
}

/* ---- per-user state mutations -------------------------------------- */

export interface StatePatch {
  status?: ItemStatus
  isFavorite?: boolean
  readingProgress?: number
  readingSegmentId?: string | null
}

/**
 * Update this user's state for an item.
 *
 * The WHERE EXISTS is what makes this safe: the state row is only
 * written if the item genuinely belongs to the caller's organization.
 * A crafted item id from another tenant updates zero rows and returns
 * null, which the route turns into 404.
 */
export async function updateItemState(
  orgId: string,
  userId: string,
  itemId: string,
  patch: StatePatch,
): Promise<SavedItemState | null> {
  const now = Date.now()
  const rows = await query<StateRow>(
    `INSERT INTO saved_item_states (
       item_id, user_id, org_id, status, is_favorite, read_at, archived_at,
       favorited_at, reading_progress, reading_segment_id, created_at, updated_at
     )
     SELECT i.id, $2, $1,
            coalesce($4::text, 'unread'),
            coalesce($5::boolean, FALSE),
            CASE WHEN $4::text = 'read' THEN $3::bigint END,
            CASE WHEN $4::text = 'archived' THEN $3::bigint END,
            CASE WHEN $5::boolean THEN $3::bigint END,
            coalesce($6::real, 0), $7::text, $3::bigint, $3::bigint
       FROM saved_items i
      WHERE i.id = $8 AND i.org_id = $1
     ON CONFLICT (item_id, user_id) DO UPDATE SET
       status       = coalesce($4::text, saved_item_states.status),
       is_favorite  = coalesce($5::boolean, saved_item_states.is_favorite),
       read_at      = CASE WHEN $4::text = 'read'     AND saved_item_states.read_at IS NULL     THEN $3::bigint ELSE saved_item_states.read_at END,
       archived_at  = CASE WHEN $4::text = 'archived' THEN $3::bigint
                           WHEN $4::text IS NOT NULL  THEN NULL
                           ELSE saved_item_states.archived_at END,
       favorited_at = CASE WHEN $5::boolean IS TRUE  THEN coalesce(saved_item_states.favorited_at, $3::bigint)
                           WHEN $5::boolean IS FALSE THEN NULL
                           ELSE saved_item_states.favorited_at END,
       reading_progress   = coalesce($6::real, saved_item_states.reading_progress),
       reading_segment_id = coalesce($7::text, saved_item_states.reading_segment_id),
       updated_at         = $3::bigint
     RETURNING *`,
    [orgId, userId, now, patch.status ?? null, patch.isFavorite ?? null,
     patch.readingProgress ?? null, patch.readingSegmentId ?? null, itemId],
  )
  return rows[0] ? rowToState(rows[0]) : null
}

/** Returns false when the item is not in this organization — the same
 * answer as "already gone", so a probe learns nothing. Child rows
 * (state, tags, collections, reader document, audio) are removed by
 * ON DELETE CASCADE rather than by hand. */
export async function deleteItem(orgId: string, itemId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM saved_items WHERE id = $1 AND org_id = $2 RETURNING id",
    [itemId, orgId],
  )
  return rows.length > 0
}

/* ---- facets -------------------------------------------------------- */

/** Counts for the sidebar and filter chips, in one round trip. Cheap
 * because every branch is a partial aggregate over the same
 * org-scoped scan the planner already has to do. */
export async function getLibraryFacets(orgId: string, userId: string): Promise<{
  total: number; unread: number; favorites: number; archived: number
  byType: { contentType: ContentType; count: number }[]
  topDomains: { domain: string; count: number }[]
}> {
  const [totals, byType, topDomains] = await Promise.all([
    queryOne<{ total: string; unread: string; favorites: string; archived: string }>(
      `SELECT count(*) FILTER (WHERE coalesce(s.status,'unread') <> 'archived')                   AS total,
              count(*) FILTER (WHERE coalesce(s.status,'unread') = 'unread')                      AS unread,
              count(*) FILTER (WHERE s.is_favorite AND coalesce(s.status,'unread') <> 'archived') AS favorites,
              count(*) FILTER (WHERE s.status = 'archived')                                       AS archived
         FROM saved_items i
         LEFT JOIN saved_item_states s ON s.item_id = i.id AND s.org_id = i.org_id AND s.user_id = $2
        WHERE i.org_id = $1`,
      [orgId, userId],
    ),
    query<{ content_type: string; count: string }>(
      `SELECT i.content_type, count(*) AS count
         FROM saved_items i
         LEFT JOIN saved_item_states s ON s.item_id = i.id AND s.org_id = i.org_id AND s.user_id = $2
        WHERE i.org_id = $1 AND coalesce(s.status,'unread') <> 'archived'
        GROUP BY i.content_type ORDER BY count DESC`,
      [orgId, userId],
    ),
    query<{ domain: string; count: string }>(
      `SELECT i.domain, count(*) AS count FROM saved_items i
        WHERE i.org_id = $1 GROUP BY i.domain ORDER BY count DESC, i.domain ASC LIMIT 12`,
      [orgId],
    ),
  ])

  return {
    total: Number(totals?.total ?? 0),
    unread: Number(totals?.unread ?? 0),
    favorites: Number(totals?.favorites ?? 0),
    archived: Number(totals?.archived ?? 0),
    byType: byType.map((r) => ({ contentType: r.content_type as ContentType, count: Number(r.count) })),
    topDomains: topDomains.map((r) => ({ domain: r.domain, count: Number(r.count) })),
  }
}

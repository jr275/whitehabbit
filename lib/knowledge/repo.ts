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
import { getPool, query, queryOne, withTransaction } from "@/lib/db/client"
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
  /** sha256 of content_text at the time it was chunked — see
   *  lib/knowledge/indexing.ts. NULL until first indexed. */
  content_hash: string | null
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
  content_text, summary, content_hash, favorite, archived, read_at, created_at, updated_at`

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

/** Persist an AI-generated summary. Owner-scoped like every other
 *  mutation here. Called at most once per item under the current
 *  on-demand policy (service.summarizeItem never calls this for an
 *  item that already has a summary), but this function itself makes
 *  no such assumption — it is a plain, unconditional write. */
export async function setSummary(id: string, orgId: string, userId: string | null, summary: string): Promise<KnowledgeRow | null> {
  await query("UPDATE knowledge_items SET summary = $1, updated_at = $2 WHERE id = $3 AND org_id = $4 AND created_by IS NOT DISTINCT FROM $5", [
    summary,
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

/* ================================================================== *
 * DURABLE INGESTION JOBS (Commit 12A) — migrations/0006_knowledge_
 * jobs.sql. See that file's header for the state-machine rationale
 * (three statuses, no separate "claimed" status, no separate reaper).
 *
 * DELIBERATE EXCEPTION to this file's own rule stated at the top:
 * claimJobs/claimJobById take NO orgId/userId — there is no "get by
 * id alone" path anywhere else in this file on purpose, but a claim
 * is not answering "give me MY org's work," it's answering "give me
 * the next work item to run," and a background worker has no calling
 * user to scope by. This is safe because a claimed row's OWN
 * persisted org_id/created_by — written at enqueue time by an
 * already-authenticated request (requireSession(), never client
 * input) — is what gets threaded into the actual processing call
 * (lib/knowledge/service.ts's runIngestJob) afterward. The claim
 * itself never reads or writes any knowledge_items column, so it
 * cannot leak or mutate another tenant's data even though it isn't
 * org-scoped — it only ever touches knowledge_jobs rows.
 * ================================================================== */

export interface KnowledgeJobRow {
  id: string
  item_id: string
  org_id: string
  created_by: string | null
  job_type: string
  status: string // 'queued' | 'done' | 'failed'
  attempts: number
  max_attempts: number
  available_at: number
  locked_at: number | null
  locked_by: string | null
  last_error: string | null
  created_at: number
  updated_at: number
}

const JOB_COLS = `id, item_id, org_id, created_by, job_type, status, attempts, max_attempts,
  available_at, locked_at, locked_by, last_error, created_at, updated_at`

/** How long a claim is trusted before it's treated as abandoned and
 * becomes claimable again — approved policy constant. Must exceed the
 * real worst-case processing time (service.ts's FETCH_TIMEOUT_MS is
 * 15s) with real margin, and stay well under any realistic retry
 * cadence so a genuinely dead worker's job doesn't sit stuck for long. */
export const LEASE_MS = 90_000

/** Default retry budget for a freshly-enqueued job — approved policy
 * constant. A job's own max_attempts column can still vary per-row in
 * principle; every row created by enqueueIngestJob gets this value. */
export const DEFAULT_MAX_ATTEMPTS = 5

/** Atomically creates a brand-new item AND its durable ingestion job
 * in ONE transaction — the fix for the save-path orphan window the
 * Commit 12A audit found: insertSavedItem() and enqueueIngestJob()
 * were two independent round trips, so an item could commit while its
 * job failed to enqueue, leaving a permanently stuck `saved` row with
 * no job and no retry affordance (retry only ever shows for `failed`).
 * Reuses withTransaction — the same helper saveExtraction already
 * relies on for its own item+tags atomicity — rather than a second
 * transaction abstraction.
 *
 * Deliberately NOT built on top of insertSavedItem()/enqueueIngestJob()
 * themselves: those two are kept as their own standalone, independently
 * testable functions (insertSavedItem in particular is used directly by
 * tests that deliberately want an item with NO job attached), so this
 * is its own small function with the same two INSERT statements, run
 * through a shared client instead of the pool.
 *
 * The job INSERT here skips enqueueIngestJob's ON CONFLICT/retry-loop
 * dance on purpose: itemId is freshly generated inside THIS SAME
 * transaction, so no job can possibly already exist for it —
 * uq_knowledge_jobs_item_open cannot be violated by construction, not
 * just by luck. If either INSERT fails for any reason (including the
 * pre-existing knowledge_items dedup race — a concurrent save of the
 * identical URL tripping uq_knowledge_org_user_normalized), the WHOLE
 * transaction rolls back: neither the item nor the job persists, and
 * saveUrl's existing duplicate-recovery catch block (unchanged) takes
 * over exactly as it did before this function existed. */
export async function insertSavedItemWithJob(params: {
  orgId: string
  userId: string | null
  url: string
  normalizedUrl: string | null
  domain: string | null
}): Promise<{ row: KnowledgeRow; job: KnowledgeJobRow }> {
  const itemId = `kn_${randomUUID()}`
  const jobId = `knj_${randomUUID()}`
  const now = Date.now()

  return withTransaction(async (client) => {
    const itemResult = await client.query<KnowledgeRow>(
      `INSERT INTO knowledge_items (id, org_id, created_by, url, normalized_url, domain, status, kind, attempts, favorite, archived, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'saved', 'article', 0, FALSE, FALSE, $7, $7)
       RETURNING ${SELECT_COLS}`,
      [itemId, params.orgId, params.userId, params.url, params.normalizedUrl, params.domain, now],
    )
    const row = itemResult.rows[0]

    const jobResult = await client.query<KnowledgeJobRow>(
      `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ingest', 'queued', 0, $5, $6, $6, $6)
       RETURNING ${JOB_COLS}`,
      [jobId, itemId, params.orgId, params.userId, DEFAULT_MAX_ATTEMPTS, now],
    )
    const job = jobResult.rows[0]

    return { row, job }
  })
}

/** Enqueues one durable ingestion job for an EXISTING item — used by
 * the retry route (a new save uses insertSavedItemWithJob above
 * instead, which creates both atomically for a brand-new item). Called
 * BEFORE the item is reset to `saved` and before the HTTP response is
 * returned, so the job exists in Postgres even if the calling function
 * is torn down the instant after — and, just as importantly, so a
 * failure here never destroys the item's prior `failed` state (see
 * this function's callers).
 *
 * IDEMPOTENCY: uq_knowledge_jobs_item_open (a partial unique index on
 * item_id WHERE status='queued') is the database's own final
 * protection — not just this function's logic — against two open
 * jobs ever existing for the same item. `ON CONFLICT ... DO NOTHING`
 * targets that exact index; when it fires, this returns the ALREADY-
 * open job (read back explicitly) rather than fabricating a new one,
 * so a double-clicked Retry (or any other concurrent double-enqueue)
 * resolves cleanly to one real job, and the caller still gets a real
 * job id to hand to the after() fast path either way. */
export async function enqueueIngestJob(itemId: string, orgId: string, userId: string | null): Promise<KnowledgeJobRow> {
  const now = Date.now()
  // Bounded at 2 attempts: an ON CONFLICT DO NOTHING that inserted
  // nothing means an open job already exists; the SELECT immediately
  // after reads it back. The only way that SELECT could also come up
  // empty is the vanishingly rare case where that blocking job
  // finished in the few milliseconds between the two statements — one
  // more loop iteration then inserts cleanly, since nothing blocks it
  // anymore.
  for (let attempt = 0; attempt < 2; attempt++) {
    const inserted = await queryOne<KnowledgeJobRow>(
      `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ingest', 'queued', 0, $5, $6, $6, $6)
       ON CONFLICT (item_id) WHERE status = 'queued' DO NOTHING
       RETURNING ${JOB_COLS}`,
      [`knj_${randomUUID()}`, itemId, orgId, userId, DEFAULT_MAX_ATTEMPTS, now],
    )
    if (inserted) return inserted

    const existing = await queryOne<KnowledgeJobRow>(
      `SELECT ${JOB_COLS} FROM knowledge_jobs WHERE item_id = $1 AND status = 'queued' ORDER BY created_at DESC LIMIT 1`,
      [itemId],
    )
    if (existing) return existing
  }
  // Practically unreachable (see the comment above) — fails loudly
  // rather than returning something fabricated.
  throw new Error(`enqueueIngestJob: could not enqueue or find an open job for item ${itemId}`)
}

/** The ONE atomic claim primitive — FOR UPDATE SKIP LOCKED inside a
 * CTE, then an UPDATE keyed off it, as a single statement (Postgres
 * treats one statement as one implicit transaction, so this needs no
 * explicit BEGIN/COMMIT via withTransaction). A row already locked by
 * a concurrent claim is invisible to this query rather than blocked
 * on — two simultaneous callers partition the claimable set, never
 * both claim the same row. A stale lease (locked_at older than
 * LEASE_MS) is treated as unclaimed, which is the entire "reaper":
 * there is no separate process that un-claims anything.
 *
 * Both claimJobs (batched) and claimJobById (targeted) below call
 * this SAME function — the requirement that both the after() fast
 * path and a future batched worker "use the same atomic claim
 * primitive" is enforced at the SQL level, not just by convention. */
async function claimJobsInternal(opts: { limit: number; workerId: string; now: number; onlyJobId?: string }): Promise<KnowledgeJobRow[]> {
  const params: unknown[] = [opts.now, opts.now - LEASE_MS, opts.workerId]
  let idFilter = ""
  if (opts.onlyJobId) {
    params.push(opts.onlyJobId)
    idFilter = `AND id = $${params.length}`
  }
  params.push(opts.limit)
  const limitIdx = params.length

  return query<KnowledgeJobRow>(
    `WITH claimable AS (
       SELECT id FROM knowledge_jobs
       WHERE status = 'queued'
         AND available_at <= $1
         AND (locked_at IS NULL OR locked_at < $2)
         ${idFilter}
       ORDER BY available_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $${limitIdx}
     )
     UPDATE knowledge_jobs
     SET locked_at = $1, locked_by = $3, updated_at = $1
     WHERE id IN (SELECT id FROM claimable)
     RETURNING ${JOB_COLS}`,
    params,
  )
}

/** Batched claim — for a future scheduled worker (Commit 12B; not
 * wired to any route yet in this commit). Not used by anything today,
 * but built and tested now since claimJobById below shares its exact
 * claim mechanics. */
export async function claimJobs(limit: number, workerId: string, now: number = Date.now()): Promise<KnowledgeJobRow[]> {
  return claimJobsInternal({ limit, workerId, now })
}

/** Targeted claim of one specific job by id — the after() fast path.
 * Returns null if that job isn't currently claimable (already
 * claimed by someone else, already terminal, or its available_at
 * hasn't arrived yet) rather than claiming a different job instead —
 * the fast path either gets exactly the job it just enqueued, or
 * nothing, never a substitute. */
export async function claimJobById(jobId: string, workerId: string, now: number = Date.now()): Promise<KnowledgeJobRow | null> {
  const rows = await claimJobsInternal({ limit: 1, workerId, now, onlyJobId: jobId })
  return rows[0] ?? null
}

/** Marks a claimed job done — success. Clears the lease; there is
 * nothing left to reclaim once a job is terminal.
 *
 * LEASE FENCING: the WHERE clause requires `locked_by = workerId` —
 * the same worker id this job was claimed with. Without this, a
 * "zombie" worker that overran its lease (LEASE_MS) and finishes
 * AFTER a second worker has already reclaimed and is processing the
 * same job could still silently overwrite that second worker's
 * outcome with its own stale one, purely because completeJob wrote by
 * id alone. With the fence, a stale worker's write matches zero rows
 * — a real no-op the caller can detect via the returned boolean —
 * instead of clobbering whoever legitimately holds the job now.
 * Returns true if THIS worker's write actually took effect. */
export async function completeJob(jobId: string, workerId: string): Promise<boolean> {
  const result = await getPool().query(
    "UPDATE knowledge_jobs SET status = 'done', locked_at = NULL, locked_by = NULL, updated_at = $1 WHERE id = $2 AND locked_by = $3",
    [Date.now(), jobId, workerId],
  )
  return (result.rowCount ?? 0) > 0
}

/** Records a failed attempt. The CALLER (service.ts's claimAndRunJob)
 * decides retry-vs-terminal and computes the backoff — that's policy,
 * and it already holds the claimed row (with its own attempts/
 * max_attempts) from the claim call, so no extra read is needed here.
 * This function only persists the decision:
 *   retryAt !== null → back to 'queued', lease cleared, available_at
 *                       pushed out by the given backoff
 *   retryAt === null → terminal 'failed', lease cleared
 * Either way `attempts` and `last_error` are written from the
 * caller's own count — never recomputed here, so there is exactly one
 * place (service.ts) that decides what "one more failure" means.
 *
 * LEASE FENCING: same `locked_by = workerId` guard as completeJob,
 * same reason — a stale worker must not be able to record a job as
 * retried or terminally failed once someone else has reclaimed it.
 * Returns true if THIS worker's write actually took effect. */
export async function failJob(
  jobId: string,
  workerId: string,
  outcome: { attempts: number; error: string; retryAt: number | null },
): Promise<boolean> {
  const now = Date.now()
  if (outcome.retryAt !== null) {
    const result = await getPool().query(
      `UPDATE knowledge_jobs
       SET status = 'queued', attempts = $1, last_error = $2, available_at = $3, locked_at = NULL, locked_by = NULL, updated_at = $4
       WHERE id = $5 AND locked_by = $6`,
      [outcome.attempts, outcome.error, outcome.retryAt, now, jobId, workerId],
    )
    return (result.rowCount ?? 0) > 0
  } else {
    const result = await getPool().query(
      `UPDATE knowledge_jobs
       SET status = 'failed', attempts = $1, last_error = $2, locked_at = NULL, locked_by = NULL, updated_at = $3
       WHERE id = $4 AND locked_by = $5`,
      [outcome.attempts, outcome.error, now, jobId, workerId],
    )
    return (result.rowCount ?? 0) > 0
  }
}

/** Test/debug seam only — reads a job by id with no ownership scoping
 * (matching the claim functions' own exception above). Not used by
 * any route; exists so tests can assert on a job's real persisted
 * state without reaching into SQL directly. */
export async function getJob(jobId: string): Promise<KnowledgeJobRow | null> {
  return queryOne<KnowledgeJobRow>(`SELECT ${JOB_COLS} FROM knowledge_jobs WHERE id = $1`, [jobId])
}

/* ================================================================== *
 * CHUNKS — the retrieval substrate (Phase C).
 *
 * Every function here is owner-scoped the same way the item reads
 * are: (org_id, created_by), taken from the session and never from a
 * request body. Chunks mirror their parent's ownership onto their own
 * rows (see 0007), so these filters sit on the row being touched
 * rather than on a join that a later refactor could drop.
 * ================================================================== */

export interface KnowledgeChunkRow {
  id: string
  item_id: string
  org_id: string
  created_by: string | null
  ordinal: number
  text: string
  char_start: number | null
  char_end: number | null
  token_estimate: number | null
  content_hash: string
  created_at: number
  updated_at: number
}

const CHUNK_COLS = `id, item_id, org_id, created_by, ordinal, text, char_start, char_end,
  token_estimate, content_hash, created_at, updated_at`

/** A document's chunks in reading order. Served by
 *  uq_knowledge_chunks_item_ordinal as a prefix scan. */
export async function getChunks(itemId: string, orgId: string, userId: string | null): Promise<KnowledgeChunkRow[]> {
  return query<KnowledgeChunkRow>(
    `SELECT ${CHUNK_COLS} FROM knowledge_chunks
      WHERE item_id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3
      ORDER BY ordinal ASC`,
    [itemId, orgId, userId],
  )
}

export interface ChunkInput {
  id: string
  ordinal: number
  text: string
  charStart: number
  charEnd: number
  tokenEstimate: number
  contentHash: string
}

export type ReplaceChunksOutcome =
  | { status: "replaced"; chunks: number }
  | { status: "unchanged"; chunks: number }
  | { status: "not_found" }

/**
 * Writes a document's chunks and stamps the item's content_hash, all
 * in one transaction.
 *
 * CONCURRENCY. Two indexers racing on the same item would otherwise
 * both DELETE and both INSERT, and the loser would violate
 * uq_knowledge_chunks_item_ordinal — a crash where the correct
 * outcome is "the other one already did it". The first statement
 * takes a row lock on the parent item, so the second waits, then
 * re-reads the hash inside the lock and finds its work already done.
 * That double-check is what makes this idempotent under concurrency
 * rather than merely idempotent when run twice in sequence.
 *
 * The same lock is the ownership check: the SELECT filters on
 * (org_id, created_by), so an item the caller does not own is simply
 * not found and nothing is written — there is no path here that
 * creates a chunk under an owner the caller could not already read.
 */
export async function replaceChunks(
  itemId: string,
  orgId: string,
  userId: string | null,
  contentHash: string,
  chunks: ChunkInput[],
): Promise<ReplaceChunksOutcome> {
  const now = Date.now()
  return withTransaction(async (client) => {
    const locked = await client.query<{ content_hash: string | null }>(
      `SELECT content_hash FROM knowledge_items
        WHERE id = $1 AND org_id = $2 AND created_by IS NOT DISTINCT FROM $3
        FOR UPDATE`,
      [itemId, orgId, userId],
    )
    if (locked.rowCount === 0) return { status: "not_found" }

    // Re-checked under the lock, not before it: between our caller's
    // read and this transaction, another indexer may have finished
    // the identical work. Rewriting identical rows would churn the
    // table and, once embeddings exist, throw away vectors we would
    // immediately pay to recompute.
    if (locked.rows[0].content_hash === contentHash) {
      const existing = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM knowledge_chunks WHERE item_id = $1`,
        [itemId],
      )
      const n = Number(existing.rows[0].n)
      if (n === chunks.length) return { status: "unchanged", chunks: n }
      // Hash matches but the chunk rows do not: a previous run was
      // interrupted between writing chunks and stamping the hash, or
      // rows were removed underneath us. Fall through and rebuild.
    }

    // Stale chunks must not survive a content change. DELETE-then-
    // INSERT rather than upsert-and-prune: the chunk count can shrink,
    // and a leftover high-ordinal chunk from longer content would stay
    // retrievable forever, citing text the document no longer has.
    await client.query(`DELETE FROM knowledge_chunks WHERE item_id = $1`, [itemId])

    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO knowledge_chunks
           (id, item_id, org_id, created_by, ordinal, text, char_start, char_end,
            token_estimate, content_hash, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          chunk.id, itemId, orgId, userId, chunk.ordinal, chunk.text,
          chunk.charStart, chunk.charEnd, chunk.tokenEstimate, chunk.contentHash, now,
        ],
      )
    }

    await client.query(
      `UPDATE knowledge_items SET content_hash = $1, updated_at = $2 WHERE id = $3`,
      [contentHash, now, itemId],
    )

    return { status: "replaced", chunks: chunks.length }
  })
}

/** Enqueues an indexing job for an item whose content is ready.
 *
 * Shares knowledge_jobs with ingestion rather than opening a second
 * queue: the lease, backoff, attempt cap and stale-claim reaping are
 * already solved there, and a parallel queue would need all of it
 * again. See the job_type dispatch in service.ts.
 *
 * uq_knowledge_jobs_item_open permits only ONE queued job per item,
 * whatever its type — so this is called after the ingest job leaves
 * the queue, never alongside it. ON CONFLICT DO NOTHING makes a
 * double-enqueue resolve to the existing job instead of an error. */
export async function enqueueIndexJob(itemId: string, orgId: string, userId: string | null): Promise<KnowledgeJobRow | null> {
  const now = Date.now()
  const inserted = await queryOne<KnowledgeJobRow>(
    `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'index', 'queued', 0, $5, $6, $6, $6)
     ON CONFLICT (item_id) WHERE status = 'queued' DO NOTHING
     RETURNING ${JOB_COLS}`,
    [`knj_${randomUUID()}`, itemId, orgId, userId, DEFAULT_MAX_ATTEMPTS, now],
  )
  if (inserted) return inserted
  return queryOne<KnowledgeJobRow>(
    `SELECT ${JOB_COLS} FROM knowledge_jobs WHERE item_id = $1 AND status = 'queued' ORDER BY created_at DESC LIMIT 1`,
    [itemId],
  )
}

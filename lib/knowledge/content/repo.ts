import "server-only"

/* ================================================================== *
 * KNOWLEDGE REPOSITORY
 *
 * THE RULE: every function here takes an AccessScope and filters on
 * scope.workspaceId. There is deliberately no "get by id alone" path.
 * Because AccessScope is a required parameter, omitting tenant scoping
 * is a compile error rather than a convention someone has to remember.
 *
 * Raw parameterized SQL, matching lib/db/repo.ts's established style —
 * no ORM (Phase 2 §5).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "@/lib/platform/db"
import type { AccessScope } from "../access/scope.ts"
import type { ObjectStatus } from "../ingestion/state.ts"
import type { KnowledgeContent, KnowledgeObject, KnowledgeObjectWithContent, KnowledgeUserState } from "./types.ts"

interface ObjectRow {
  id: string
  org_id: string
  created_by: string | null
  submitted_url: string
  canonical_url: string
  url_hash: string
  resolved_url: string | null
  origin_url: string | null
  domain: string
  title: string | null
  authors: string[]
  excerpt: string | null
  published_at: string | null
  language: string | null
  site_name: string | null
  image_url: string | null
  favicon_url: string | null
  word_count: number | null
  reading_time_seconds: number | null
  status: string
  failure_code: string | null
  failure_message: string | null
  extractor: string | null
  http_status: number | null
  created_at: string
  updated_at: string
}

const num = (v: string | number | null): number | null => (v === null ? null : Number(v))

function rowToObject(r: ObjectRow): KnowledgeObject {
  return {
    id: r.id,
    workspaceId: r.org_id,
    createdBy: r.created_by,
    submittedUrl: r.submitted_url,
    canonicalUrl: r.canonical_url,
    urlHash: r.url_hash,
    resolvedUrl: r.resolved_url,
    originUrl: r.origin_url,
    domain: r.domain,
    title: r.title,
    authors: r.authors ?? [],
    excerpt: r.excerpt,
    publishedAt: num(r.published_at),
    language: r.language,
    siteName: r.site_name,
    imageUrl: r.image_url,
    faviconUrl: r.favicon_url,
    wordCount: r.word_count,
    readingTimeSeconds: r.reading_time_seconds,
    status: r.status as ObjectStatus,
    failureCode: r.failure_code,
    failureMessage: r.failure_message,
    extractor: r.extractor,
    httpStatus: r.http_status,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

const OBJECT_COLUMNS = `id, org_id, created_by, submitted_url, canonical_url, url_hash, resolved_url, origin_url,
  domain, title, authors, excerpt, published_at, language, site_name, image_url, favicon_url, word_count,
  reading_time_seconds, status, failure_code, failure_message, extractor, http_status, created_at, updated_at`

/* ---- reads -------------------------------------------------------- */

export async function findByUrlHash(scope: AccessScope, urlHash: string): Promise<KnowledgeObject | null> {
  const row = await queryOne<ObjectRow>(
    `SELECT ${OBJECT_COLUMNS} FROM knowledge_objects
     WHERE org_id = $1 AND url_hash = $2 AND deleted_at IS NULL`,
    [scope.workspaceId, urlHash],
  )
  return row ? rowToObject(row) : null
}

export interface ListOptions {
  limit?: number
  cursor?: { createdAt: number; id: string } | null
}

export async function listObjects(
  scope: AccessScope,
  options: ListOptions = {},
): Promise<{ items: KnowledgeObject[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100)
  const params: unknown[] = [scope.workspaceId]
  let cursorClause = ""

  if (options.cursor) {
    // Keyset pagination on (created_at, id) — stable under concurrent
    // writes, unlike OFFSET, which shifts as rows are inserted.
    params.push(options.cursor.createdAt, options.cursor.id)
    cursorClause = `AND (created_at, id) < ($2::bigint, $3::text)`
  }
  params.push(limit + 1)

  const rows = await query<ObjectRow>(
    `SELECT ${OBJECT_COLUMNS} FROM knowledge_objects
     WHERE org_id = $1 AND deleted_at IS NULL ${cursorClause}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params,
  )

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return {
    items: page.map(rowToObject),
    nextCursor: hasMore && last ? `${last.created_at}_${last.id}` : null,
  }
}

export function parseCursor(raw: string | null): { createdAt: number; id: string } | null {
  if (!raw) return null
  const index = raw.indexOf("_")
  if (index <= 0) return null
  const createdAt = Number(raw.slice(0, index))
  const id = raw.slice(index + 1)
  if (!Number.isFinite(createdAt) || id.length === 0) return null
  return { createdAt, id }
}

export async function getObject(scope: AccessScope, id: string): Promise<KnowledgeObject | null> {
  const row = await queryOne<ObjectRow>(
    `SELECT ${OBJECT_COLUMNS} FROM knowledge_objects
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [id, scope.workspaceId],
  )
  return row ? rowToObject(row) : null
}

export async function getObjectWithContent(scope: AccessScope, id: string): Promise<KnowledgeObjectWithContent | null> {
  const object = await getObject(scope, id)
  if (!object) return null

  const contentRow = await queryOne<{
    object_id: string
    content_html: string | null
    content_text: string | null
    content_hash: string | null
    extracted_at: string
  }>(
    `SELECT object_id, content_html, content_text, content_hash, extracted_at
     FROM knowledge_content WHERE object_id = $1 AND org_id = $2`,
    [id, scope.workspaceId],
  )

  const stateRow = await queryOne<{
    user_id: string
    object_id: string
    last_opened_at: string | null
    opened_count: number
  }>(
    `SELECT user_id, object_id, last_opened_at, opened_count
     FROM knowledge_user_state WHERE user_id = $1 AND object_id = $2 AND org_id = $3`,
    [scope.userId, id, scope.workspaceId],
  )

  const content: KnowledgeContent | null = contentRow
    ? {
        objectId: contentRow.object_id,
        contentHtml: contentRow.content_html,
        contentText: contentRow.content_text,
        contentHash: contentRow.content_hash,
        extractedAt: Number(contentRow.extracted_at),
      }
    : null

  const userState: KnowledgeUserState | null = stateRow
    ? {
        userId: stateRow.user_id,
        objectId: stateRow.object_id,
        lastOpenedAt: num(stateRow.last_opened_at),
        openedCount: stateRow.opened_count,
      }
    : null

  return { object, content, userState }
}

/* ---- writes ------------------------------------------------------- */

export interface CreateObjectInput {
  submittedUrl: string
  canonicalUrl: string
  urlHash: string
  domain: string
}

/**
 * Creates the object AND its ingestion job in ONE transaction.
 *
 * This is load-bearing: it makes "the object exists but no job was
 * created" structurally impossible — the single most common failure
 * mode in ingestion systems, and one that leaves objects stuck in
 * `pending` forever with no error anywhere.
 *
 * Returns the existing object when the URL is already saved, so a
 * duplicate save performs no fetch and creates no work.
 */
export async function createObjectWithJob(
  scope: AccessScope,
  input: CreateObjectInput,
): Promise<{ object: KnowledgeObject; created: boolean }> {
  const existing = await findByUrlHash(scope, input.urlHash)
  if (existing) return { object: existing, created: false }

  const now = Date.now()
  const objectId = `obj_${randomUUID()}`
  const jobId = `kjob_${randomUUID()}`

  return withTransaction(async (client) => {
    const inserted = await client.query<ObjectRow>(
      `INSERT INTO knowledge_objects
         (id, org_id, created_by, submitted_url, canonical_url, url_hash, domain, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $8)
       ON CONFLICT (org_id, url_hash) DO NOTHING
       RETURNING ${OBJECT_COLUMNS}`,
      [objectId, scope.workspaceId, scope.userId, input.submittedUrl, input.canonicalUrl, input.urlHash, input.domain, now],
    )

    // Lost a race with a concurrent identical save — return the winner.
    if (inserted.rows.length === 0) {
      const winner = await client.query<ObjectRow>(
        `SELECT ${OBJECT_COLUMNS} FROM knowledge_objects WHERE org_id = $1 AND url_hash = $2`,
        [scope.workspaceId, input.urlHash],
      )
      return { object: rowToObject(winner.rows[0]), created: false }
    }

    await client.query(
      `INSERT INTO knowledge_jobs
         (id, org_id, object_id, kind, status, attempt, run_after, idempotency_key, created_at, updated_at)
       VALUES ($1, $2, $3, 'ingest', 'pending', 0, $4, $5, $4, $4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [jobId, scope.workspaceId, objectId, now, `ingest:${objectId}`],
    )

    return { object: rowToObject(inserted.rows[0]), created: true }
  })
}

/** Records that this user opened this object. Lazily creates the row,
 * so the table stays proportional to engagement, not library size. */
export async function recordOpened(scope: AccessScope, objectId: string): Promise<void> {
  const now = Date.now()
  await query(
    `INSERT INTO knowledge_user_state (user_id, object_id, org_id, last_opened_at, opened_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, $4, $4)
     ON CONFLICT (user_id, object_id)
     DO UPDATE SET last_opened_at = $4, opened_count = knowledge_user_state.opened_count + 1, updated_at = $4`,
    [scope.userId, objectId, scope.workspaceId, now],
  )
}

export async function softDeleteObject(scope: AccessScope, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE knowledge_objects SET deleted_at = $1, updated_at = $1
     WHERE id = $2 AND org_id = $3 AND deleted_at IS NULL RETURNING id`,
    [Date.now(), id, scope.workspaceId],
  )
  return rows.length > 0
}

/** Re-arms a failed object for another attempt. */
export async function retryObject(scope: AccessScope, id: string): Promise<boolean> {
  const now = Date.now()
  return withTransaction(async (client) => {
    const reset = await client.query<{ id: string }>(
      `UPDATE knowledge_objects
       SET status = 'pending', failure_code = NULL, failure_message = NULL, updated_at = $1
       WHERE id = $2 AND org_id = $3 AND status = 'failed' AND deleted_at IS NULL
       RETURNING id`,
      [now, id, scope.workspaceId],
    )
    if (reset.rows.length === 0) return false

    await client.query(
      `UPDATE knowledge_jobs
       SET status = 'pending', attempt = 0, run_after = $1, locked_at = NULL, locked_by = NULL,
           last_error_code = NULL, last_error = NULL, updated_at = $1
       WHERE object_id = $2 AND org_id = $3`,
      [now, id, scope.workspaceId],
    )
    return true
  })
}

import "server-only"

/* ================================================================== *
 * ARTIFACT REPOSITORY
 *
 * THE RULE, unchanged from the content repository: every function
 * takes an AccessScope and filters on scope.workspaceId. There is no
 * "get by id alone" path, so omitting tenant scoping is a compile
 * error rather than a convention.
 *
 * That rule matters more here than anywhere else in the product. An
 * artifact is raw, unsanitized, attacker-controlled HTML from an
 * arbitrary website. Handing one to the wrong tenant is not a privacy
 * bug, it is a stored-XSS delivery mechanism — so the tenant check
 * happens BEFORE the blob is even located, never after.
 *
 * Raw parameterized SQL, matching the established style — no ORM.
 * ================================================================== */

import { query, queryOne } from "@/lib/platform/db"
import type { AccessScope } from "../access/types.ts"
import type { BlobStoreId } from "../storage/types.ts"
import type { Artifact, ArtifactKind } from "./types.ts"

interface ArtifactRow {
  id: string
  object_id: string
  org_id: string
  kind: string
  storage_backend: string
  storage_key: string
  content_type: string
  content_encoding: string
  charset: string | null
  byte_size: string
  original_byte_size: string
  checksum: string
  fetched_at: string
  requested_url: string
  resolved_url: string | null
  http_status: number | null
  created_at: string
  deleted_at: string | null
}

function rowToArtifact(r: ArtifactRow): Artifact {
  return {
    id: r.id,
    objectId: r.object_id,
    workspaceId: r.org_id,
    kind: r.kind as ArtifactKind,
    storageBackend: r.storage_backend as BlobStoreId,
    storageKey: r.storage_key,
    contentType: r.content_type,
    contentEncoding: r.content_encoding as "gzip" | "identity",
    charset: r.charset,
    byteSize: Number(r.byte_size),
    originalByteSize: Number(r.original_byte_size),
    checksum: r.checksum,
    fetchedAt: Number(r.fetched_at),
    requestedUrl: r.requested_url,
    resolvedUrl: r.resolved_url,
    httpStatus: r.http_status === null ? null : Number(r.http_status),
    createdAt: Number(r.created_at),
    deletedAt: r.deleted_at === null ? null : Number(r.deleted_at),
  }
}

const COLUMNS = `id, object_id, org_id, kind, storage_backend, storage_key, content_type,
   content_encoding, charset, byte_size, original_byte_size, checksum, fetched_at,
   requested_url, resolved_url, http_status, created_at, deleted_at`

export interface NewArtifact {
  id: string
  objectId: string
  kind: ArtifactKind
  storageBackend: BlobStoreId
  storageKey: string
  contentType: string
  contentEncoding: "gzip" | "identity"
  charset: string | null
  byteSize: number
  originalByteSize: number
  checksum: string
  fetchedAt: number
  requestedUrl: string
  resolvedUrl: string | null
  httpStatus: number | null
}

/**
 * Record an artifact.
 *
 * Idempotent by (object, kind, checksum): re-fetching a page that has
 * not changed, or retrying a job that already stored its bytes,
 * returns the EXISTING row rather than creating a second one. The
 * caller learns which happened from the returned row's id, and can
 * garbage-collect the blob it just wrote if it lost the race.
 */
export async function recordArtifact(scope: AccessScope, input: NewArtifact): Promise<Artifact> {
  const now = Date.now()
  const row = await queryOne<ArtifactRow>(
    `INSERT INTO knowledge_artifacts (
       id, object_id, org_id, kind, storage_backend, storage_key, content_type,
       content_encoding, charset, byte_size, original_byte_size, checksum,
       fetched_at, requested_url, resolved_url, http_status, created_at)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
     -- The object must belong to this workspace. Expressed as a guard
     -- on the INSERT rather than a prior SELECT so there is no window
     -- between the check and the write.
     WHERE EXISTS (
       SELECT 1 FROM knowledge_objects
       WHERE id = $2 AND org_id = $3 AND deleted_at IS NULL
     )
     ON CONFLICT DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      input.id,
      input.objectId,
      scope.workspaceId,
      input.kind,
      input.storageBackend,
      input.storageKey,
      input.contentType,
      input.contentEncoding,
      input.charset,
      input.byteSize,
      input.originalByteSize,
      input.checksum,
      input.fetchedAt,
      input.requestedUrl,
      input.resolvedUrl,
      input.httpStatus,
      now,
    ],
  )
  if (row) return rowToArtifact(row)

  // ON CONFLICT DO NOTHING: an identical capture already exists.
  const existing = await queryOne<ArtifactRow>(
    `SELECT ${COLUMNS} FROM knowledge_artifacts
     WHERE object_id = $1 AND org_id = $2 AND kind = $3 AND checksum = $4 AND deleted_at IS NULL`,
    [input.objectId, scope.workspaceId, input.kind, input.checksum],
  )
  if (existing) return rowToArtifact(existing)

  // Neither inserted nor found: the object is not this workspace's.
  throw new Error("knowledge_artifact_insert_denied")
}

/** The newest surviving capture — the reprocessing entry point. */
export async function latestArtifact(
  scope: AccessScope,
  objectId: string,
  kind: ArtifactKind = "raw_html",
): Promise<Artifact | null> {
  const row = await queryOne<ArtifactRow>(
    `SELECT ${COLUMNS} FROM knowledge_artifacts
     WHERE object_id = $1 AND org_id = $2 AND kind = $3 AND deleted_at IS NULL
     ORDER BY fetched_at DESC, created_at DESC
     LIMIT 1`,
    [objectId, scope.workspaceId, kind],
  )
  return row ? rowToArtifact(row) : null
}

export async function getArtifact(scope: AccessScope, artifactId: string): Promise<Artifact | null> {
  const row = await queryOne<ArtifactRow>(
    `SELECT ${COLUMNS} FROM knowledge_artifacts
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [artifactId, scope.workspaceId],
  )
  return row ? rowToArtifact(row) : null
}

/** Every surviving capture of one object, newest first. */
export async function listArtifacts(scope: AccessScope, objectId: string): Promise<Artifact[]> {
  const rows = await query<ArtifactRow>(
    `SELECT ${COLUMNS} FROM knowledge_artifacts
     WHERE object_id = $1 AND org_id = $2 AND deleted_at IS NULL
     ORDER BY fetched_at DESC, created_at DESC`,
    [objectId, scope.workspaceId],
  )
  return rows.map(rowToArtifact)
}

/* ---- retention ---------------------------------------------------- *
 *
 * Two-phase, deliberately. Retention MARKS rows; a separate cleanup
 * job removes the blobs and only then removes the rows. A crash
 * between the phases leaves a marked row and a live blob — recoverable
 * — instead of a live row pointing at bytes that are already gone,
 * which would be indistinguishable from data loss.
 * ------------------------------------------------------------------ */

/**
 * Release every capture of one object except the newest N.
 *
 * The newest is NEVER released: it is the only input re-extraction
 * has, and M2's whole point is that it survives. Returns how many rows
 * were marked.
 */
export async function releaseSupersededArtifacts(
  scope: AccessScope,
  objectId: string,
  keep: number,
): Promise<number> {
  if (keep < 1) throw new Error("retention must keep at least the newest artifact")
  const rows = await query<{ id: string }>(
    `UPDATE knowledge_artifacts SET deleted_at = $1
     WHERE org_id = $2 AND deleted_at IS NULL AND id IN (
       SELECT id FROM knowledge_artifacts
       WHERE object_id = $3 AND org_id = $2 AND deleted_at IS NULL
       ORDER BY fetched_at DESC, created_at DESC
       OFFSET $4
     )
     RETURNING id`,
    [Date.now(), scope.workspaceId, objectId, keep],
  )
  return rows.length
}

/**
 * Rows whose blobs are ready to be collected.
 *
 * NOT scope-filtered, and deliberately not: this is the cleanup
 * worker's query, which runs as the system across every workspace and
 * has no user behind it. It returns only rows already marked for
 * deletion — it can never reach live content — and it is not reachable
 * from any request-handling path.
 */
export async function claimCollectableArtifacts(limit: number): Promise<Artifact[]> {
  const rows = await query<ArtifactRow>(
    `SELECT ${COLUMNS} FROM knowledge_artifacts
     WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at ASC
     LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  )
  return rows.map(rowToArtifact)
}

/** Phase two: the blob is gone, so the row may go. */
export async function forgetArtifact(artifactId: string): Promise<void> {
  await query(`DELETE FROM knowledge_artifacts WHERE id = $1 AND deleted_at IS NOT NULL`, [artifactId])
}

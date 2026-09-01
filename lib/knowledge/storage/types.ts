/* ================================================================== *
 * BLOB STORE CONTRACT
 *
 * The one requirement M2 is built around: WE MUST NEVER LOSE THE
 * ORIGINAL FETCHED REPRESENTATION. Everything downstream — every
 * extractor version, every future AI stage — is re-derivable from the
 * bytes a publisher actually served us. Those bytes are the only thing
 * we cannot recompute, so they get their own storage layer with its
 * own contract.
 *
 * WHY NOT POSTGRES. Raw documents are 50 KB–10 MB each and are read
 * once per re-extraction, never in a list query. Putting them in a
 * table would bloat every backup, every restore and every replica for
 * data that is written once and read rarely (Phase 2 §14). Postgres
 * keeps the METADATA — small, queryable, transactional; the object
 * store keeps the bytes.
 *
 * DUMB ON PURPOSE. This interface knows about bytes and keys. It does
 * not know about gzip, tenants, artifacts or HTML: compression is the
 * archive layer's decision and is recorded in the database, so a
 * future change of compression cannot strand existing objects.
 *
 * THE DATABASE IS THE SOURCE OF TRUTH. A blob is reachable only via a
 * knowledge_artifacts row, and that row is only readable through an
 * AccessScope. A blob with no row is garbage, not content.
 * ================================================================== */

export type BlobStoreId = "filesystem" | "s3"

export interface BlobPutOptions {
  /** Content type of the bytes AS STORED. */
  contentType: string
  /** "gzip" when the caller compressed; "identity" otherwise. Recorded
   * so a reader knows what it is holding without sniffing. */
  contentEncoding: "gzip" | "identity"
  /** sha256 of the UNCOMPRESSED bytes, hex. Sent to backends that can
   * verify integrity, and stored alongside the row either way. */
  checksum: string
}

export interface BlobStat {
  key: string
  size: number
}

export class BlobStoreError extends Error {
  readonly code: "invalid_key" | "not_configured" | "io_error" | "too_large"
  readonly key: string | null

  // Explicit fields, not parameter properties — Node's strip-only type
  // stripping (which runs the test suite) does not support them.
  constructor(code: BlobStoreError["code"], message: string, key: string | null = null) {
    super(message)
    this.name = "BlobStoreError"
    this.code = code
    this.key = key
  }
}

export interface BlobStore {
  readonly id: BlobStoreId

  /**
   * Write bytes at `key`, overwriting any existing object.
   *
   * Overwrite rather than append or version: keys embed a per-artifact
   * id, so the same key is only ever written with the same bytes, and
   * a retried write after a crash must be a no-op rather than a
   * duplicate.
   */
  put(key: string, body: Buffer, options: BlobPutOptions): Promise<BlobStat>

  /**
   * Read bytes back, or null when the object is gone.
   *
   * Absence is NOT an error: retention may have removed an old
   * artifact while its row lives on. Callers must handle null.
   */
  get(key: string): Promise<Buffer | null>

  /** Permanently remove. Idempotent: deleting an absent key succeeds. */
  delete(key: string): Promise<void>

  /** Cheap liveness/config check, for /healthz and for tests. */
  isAvailable(): Promise<boolean>
}

/* ---- key scheme --------------------------------------------------- *
 *
 *   knowledge/<workspaceId>/<objectId>/<artifactId>.<ext>
 *
 * Tenant FIRST, deliberately:
 *   - deleting a workspace is a single prefix delete;
 *   - a bucket listing is readable by a human during an incident;
 *   - a key that crosses tenants is visibly wrong, not subtly wrong.
 *
 * Keys are NOT a security control. They are never public, never signed
 * into a URL, and never handed to a browser: authorisation is the
 * knowledge_artifacts row's org_id, checked against an AccessScope
 * before a read is even attempted. The prefix is hygiene, not defence.
 * ------------------------------------------------------------------ */

/** Ids are opaque, but they end up in filesystem paths and in URLs, so
 * every component is validated rather than trusted. */
const SAFE_COMPONENT = /^[A-Za-z0-9_-]{1,128}$/
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function artifactKey(input: {
  workspaceId: string
  objectId: string
  artifactId: string
  extension: string
}): string {
  for (const [name, value] of Object.entries(input)) {
    const ok = name === "extension" ? /^[a-z0-9.]{1,16}$/.test(value) : SAFE_COMPONENT.test(value)
    if (!ok) throw new BlobStoreError("invalid_key", `Unsafe ${name} in a storage key.`)
  }
  return `knowledge/${input.workspaceId}/${input.objectId}/${input.artifactId}.${input.extension}`
}

/** Every key a workspace owns. Used by tenant deletion. */
export function workspacePrefix(workspaceId: string): string {
  if (!SAFE_COMPONENT.test(workspaceId)) throw new BlobStoreError("invalid_key", "Unsafe workspace id.")
  return `knowledge/${workspaceId}/`
}

/**
 * Reject anything that could escape the store's root.
 *
 * The filesystem adapter turns a key into a path, so traversal here is
 * arbitrary file write. Enforced for EVERY backend, not only that one,
 * so the two can never drift apart.
 */
export function assertSafeKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) {
    throw new BlobStoreError("invalid_key", "Storage key is empty or too long.", null)
  }
  if (key.startsWith("/") || key.endsWith("/")) {
    throw new BlobStoreError("invalid_key", "Storage key must be relative.", key)
  }
  if (key.includes("..") || key.includes("//") || key.includes("\\") || CONTROL_CHARS.test(key)) {
    throw new BlobStoreError("invalid_key", "Storage key contains an unsafe sequence.", key)
  }
  for (const segment of key.split("/")) {
    if (!SAFE_SEGMENT.test(segment)) {
      throw new BlobStoreError("invalid_key", "Storage key segment is not safe.", key)
    }
  }
}

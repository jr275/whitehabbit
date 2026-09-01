import "server-only"

/* ================================================================== *
 * DOCUMENT ARCHIVE
 *
 * M2's one hard requirement lives here: WE MUST NEVER LOSE THE
 * ORIGINAL FETCHED REPRESENTATION.
 *
 * Three consequences shape everything below.
 *
 * 1. ARCHIVE BEFORE EXTRACT, ALWAYS. The bytes are written and the
 *    row committed before extraction is attempted, so a page that no
 *    extractor can read is still permanently re-processable. A failed
 *    extraction that lost the document would be the one unrecoverable
 *    failure in the system.
 *
 * 2. THE BYTES ARE THE BYTES. We archive what the socket delivered,
 *    not the decoded string: `html` is already a transformation, and a
 *    mis-detected charset must cost a re-extraction, not a document.
 *
 * 3. EVERY READ IS VERIFIED. The checksum is over the uncompressed
 *    original and is checked on the way out. A truncated or corrupted
 *    archive must announce itself, not silently produce a worse
 *    extraction that looks like a publisher's fault.
 *
 * SECURITY. What comes back out is raw, unsanitized, attacker-chosen
 * HTML. It exists to be fed to an extractor and to nothing else: it is
 * never returned by an API, never rendered, never given a public URL,
 * and never read without a tenant-scoped row lookup first. Reading is
 * also where a decompression bomb would land, so the gunzip is capped.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { createHash } from "node:crypto"
import { gunzip, gzip } from "node:zlib"
import { promisify } from "node:util"
import { logger } from "@/lib/platform/logger"
import type { AccessScope } from "../access/types.ts"
import { artifactKey, BlobStoreError, type BlobStore } from "../storage/types.ts"
import { blobStore } from "../storage/index.ts"
import { getArtifact, latestArtifact, recordArtifact } from "./repo.ts"
import { ArchiveError, type Artifact, type ArtifactKind, type LoadedArtifact } from "./types.ts"

export * from "./types.ts"
export {
  claimCollectableArtifacts,
  forgetArtifact,
  getArtifact,
  latestArtifact,
  listArtifacts,
  recordArtifact,
  releaseSupersededArtifacts,
} from "./repo.ts"

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/** Mirrors the fetch cap. A document larger than this never reached us. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

/**
 * The decompression cap.
 *
 * A gzip bomb is a few kilobytes that expand to gigabytes. We only
 * ever decompress bytes we compressed ourselves, from a document the
 * fetcher already capped — but "only ever" is exactly the assumption
 * an attacker who reaches the bucket would be relying on, so the cap
 * is enforced by zlib rather than assumed by us. Slack over the fetch
 * cap covers a legitimately-larger charset re-encode.
 */
const MAX_INFLATED_BYTES = MAX_DOCUMENT_BYTES + 2 * 1024 * 1024

/**
 * Below this, compression costs more than it saves. HTML typically
 * compresses 5–8×, so nearly every real document is worth gzipping.
 */
const MIN_BYTES_TO_COMPRESS = 1024

export function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex")
}

export interface ArchiveRequest {
  objectId: string
  kind?: ArtifactKind
  /** The bytes exactly as served. */
  body: Buffer
  contentType: string
  charset: string | null
  requestedUrl: string
  resolvedUrl: string | null
  httpStatus: number | null
  fetchedAt?: number
}

export interface ArchiveDeps {
  store?: BlobStore
}

/**
 * Store one capture and record it.
 *
 * ORDER MATTERS: blob first, row second. A crash between them leaves
 * an orphan blob, which the cleanup job collects and which costs
 * pennies. The reverse order would leave a row pointing at nothing —
 * a phantom artifact that reads as data loss.
 */
export async function archiveDocument(
  scope: AccessScope,
  request: ArchiveRequest,
  deps: ArchiveDeps = {},
): Promise<Artifact> {
  const store = deps.store ?? blobStore()
  const kind = request.kind ?? "raw_html"

  if (request.body.byteLength === 0) {
    throw new ArchiveError("artifact_missing", "There was nothing to archive.", "empty body")
  }
  if (request.body.byteLength > MAX_DOCUMENT_BYTES) {
    throw new ArchiveError("artifact_too_large", "That page was too large to archive.")
  }

  // Over the ORIGINAL bytes: it is what makes an unchanged re-fetch
  // recognisable and what a read verifies against.
  const checksum = sha256(request.body)

  const shouldCompress = request.body.byteLength >= MIN_BYTES_TO_COMPRESS
  const stored = shouldCompress ? await gzipAsync(request.body, { level: 6 }) : request.body
  const contentEncoding = shouldCompress ? "gzip" : "identity"

  const artifactId = `kart_${randomUUID()}`
  const key = artifactKey({
    workspaceId: scope.workspaceId,
    objectId: request.objectId,
    artifactId,
    extension: contentEncoding === "gzip" ? "html.gz" : "html",
  })

  try {
    await store.put(key, stored, { contentType: request.contentType, contentEncoding, checksum })
  } catch (err) {
    if (err instanceof BlobStoreError) {
      throw new ArchiveError("storage_unavailable", "We couldn't archive that page.", err.message)
    }
    throw err
  }

  const artifact = await recordArtifact(scope, {
    id: artifactId,
    objectId: request.objectId,
    kind,
    storageBackend: store.id,
    storageKey: key,
    contentType: request.contentType,
    contentEncoding,
    charset: request.charset,
    byteSize: stored.byteLength,
    originalByteSize: request.body.byteLength,
    checksum,
    fetchedAt: request.fetchedAt ?? Date.now(),
    requestedUrl: request.requestedUrl,
    resolvedUrl: request.resolvedUrl,
    httpStatus: request.httpStatus,
  })

  // We lost the idempotency race: an identical capture already
  // existed, so the blob we just wrote is an orphan. Collect it now
  // rather than leaving it for the sweeper.
  if (artifact.id !== artifactId) {
    await store.delete(key).catch(() => {})
    logger.info("knowledge_artifact_deduped", {
      objectId: request.objectId,
      workspaceId: scope.workspaceId,
      artifactId: artifact.id,
    })
    return artifact
  }

  logger.info("knowledge_artifact_stored", {
    objectId: request.objectId,
    workspaceId: scope.workspaceId,
    artifactId,
    backend: store.id,
    originalBytes: request.body.byteLength,
    storedBytes: stored.byteLength,
  })
  return artifact
}

/** Decode archived bytes with the charset the publisher declared. */
function decode(body: Buffer, charset: string | null): string {
  const normalized = (charset ?? "utf-8").toLowerCase()
  const encoding: BufferEncoding = normalized === "iso-8859-1" || normalized === "latin1" ? "latin1" : "utf8"
  return body.toString(encoding)
}

async function loadRow(store: BlobStore, artifact: Artifact): Promise<LoadedArtifact> {
  let stored: Buffer | null
  try {
    stored = await store.get(artifact.storageKey)
  } catch (err) {
    throw new ArchiveError(
      "storage_unavailable",
      "We couldn't read the archived copy of that page.",
      err instanceof Error ? err.message : String(err),
    )
  }

  if (!stored) {
    // The row outlived its bytes: retention, or a lost volume. Say so
    // precisely — this is the one failure M2 exists to make loud.
    throw new ArchiveError("artifact_missing", "The archived copy of that page is no longer available.")
  }

  let body: Buffer
  if (artifact.contentEncoding === "gzip") {
    try {
      body = await gunzipAsync(stored, { maxOutputLength: MAX_INFLATED_BYTES })
    } catch (err) {
      // zlib reports the cap as an error like any other corruption;
      // both mean the same thing to a caller — do not trust these bytes.
      const message = err instanceof Error ? err.message : String(err)
      const bomb = /maxOutputLength|buffer|memory/i.test(message)
      throw new ArchiveError(
        bomb ? "artifact_too_large" : "artifact_corrupt",
        "The archived copy of that page could not be read.",
        message,
      )
    }
  } else {
    body = stored
  }

  const actual = sha256(body)
  if (actual !== artifact.checksum) {
    // Never hand back bytes we cannot vouch for: a silent corruption
    // would look like a publisher's markup getting worse.
    throw new ArchiveError(
      "artifact_corrupt",
      "The archived copy of that page failed its integrity check.",
      `expected ${artifact.checksum.slice(0, 12)}, got ${actual.slice(0, 12)}`,
    )
  }

  return { artifact, body, html: decode(body, artifact.charset) }
}

/**
 * Read one artifact back.
 *
 * Tenant-scoped by construction: the row lookup filters on the
 * workspace BEFORE the blob is located, so there is no path from an
 * artifact id alone to any bytes.
 */
export async function loadArtifact(
  scope: AccessScope,
  artifactId: string,
  deps: ArchiveDeps = {},
): Promise<LoadedArtifact> {
  const artifact = await getArtifact(scope, artifactId)
  if (!artifact) throw new ArchiveError("artifact_missing", "That archived page could not be found.")
  return loadRow(deps.store ?? blobStore(), artifact)
}

/** The newest surviving capture of an object — what re-extraction reads. */
export async function loadLatestArtifact(
  scope: AccessScope,
  objectId: string,
  deps: ArchiveDeps = {},
): Promise<LoadedArtifact> {
  const artifact = await latestArtifact(scope, objectId)
  if (!artifact) {
    throw new ArchiveError(
      "artifact_missing",
      "We don't have an archived copy of that page yet.",
      "no artifact rows for object",
    )
  }
  return loadRow(deps.store ?? blobStore(), artifact)
}

export const __archiveLimits = { MAX_DOCUMENT_BYTES, MAX_INFLATED_BYTES, MIN_BYTES_TO_COMPRESS }

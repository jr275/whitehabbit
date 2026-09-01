/* ================================================================== *
 * ARCHIVE TYPES
 *
 * An ARTIFACT is one immutable capture of what a publisher served us,
 * at one moment, at one URL. It is the input every extraction is
 * derived from, and the only thing in the system that cannot be
 * recomputed.
 *
 * Artifacts are never edited. A re-fetch produces a NEW artifact
 * alongside the old one; retention decides which survive. That
 * immutability is what makes "re-extract everything with the new
 * ruleset" a safe operation rather than a hopeful one.
 * ================================================================== */

import type { BlobStoreId } from "../storage/types.ts"

export type ArtifactKind = "raw_html"

export interface Artifact {
  id: string
  objectId: string
  workspaceId: string
  kind: ArtifactKind

  storageBackend: BlobStoreId
  storageKey: string

  contentType: string
  /** How the bytes are stored, NOT how they were served. */
  contentEncoding: "gzip" | "identity"
  /** As declared by the publisher, so a decode is reproducible. */
  charset: string | null

  /** Stored (compressed) size. */
  byteSize: number
  /** Size of the bytes as fetched. */
  originalByteSize: number
  /** sha256 of the UNCOMPRESSED bytes, hex. */
  checksum: string

  fetchedAt: number
  requestedUrl: string
  resolvedUrl: string | null
  httpStatus: number | null

  createdAt: number
  deletedAt: number | null
}

/** An artifact's row plus its bytes, decompressed and verified. */
export interface LoadedArtifact {
  artifact: Artifact
  /** The bytes exactly as served. */
  body: Buffer
  /** Those bytes decoded with the recorded charset. */
  html: string
}

export type ArchiveFailureCode =
  /** The row exists but the blob is gone — retention, or a lost volume. */
  | "artifact_missing"
  /** The blob is there but does not match its recorded checksum. */
  | "artifact_corrupt"
  /** Storage refused a read or a write. */
  | "storage_unavailable"
  /** The document exceeded a limit — including after decompression. */
  | "artifact_too_large"

export class ArchiveError extends Error {
  readonly code: ArchiveFailureCode
  readonly userMessage: string

  // Explicit fields, not parameter properties — Node's strip-only type
  // stripping (which runs the test suite) does not support them.
  constructor(code: ArchiveFailureCode, userMessage: string, detail?: string) {
    super(detail ?? userMessage)
    this.name = "ArchiveError"
    this.code = code
    this.userMessage = userMessage
  }
}

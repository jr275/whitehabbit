import "server-only"

/* ================================================================== *
 * BLOB STORE SELECTION
 *
 * One place decides which backend is in use, from configuration alone.
 * Nothing else in the product names a backend: callers take a
 * BlobStore, and every artifact row records which backend wrote it, so
 * a deployment can migrate from disk to S3 without stranding anything
 * already archived.
 *
 * The choice is deliberately implicit-by-configuration rather than a
 * KNOWLEDGE_STORAGE_BACKEND flag: a flag that disagrees with the
 * credentials present is a configuration error waiting to happen at
 * 3am. Bucket credentials present means S3; absent means disk.
 * ================================================================== */

import { createFilesystemStore, filesystemRoot } from "./filesystem.ts"
import { createS3Store, s3ConfigFromEnv } from "./s3.ts"
import type { BlobStore } from "./types.ts"

export * from "./types.ts"
export { createFilesystemStore, filesystemRoot } from "./filesystem.ts"
export { createS3Store, s3ConfigFromEnv, type S3Config } from "./s3.ts"

let cached: BlobStore | null = null

/**
 * The process-wide store. Cached because constructing the S3 adapter
 * parses and validates configuration, and because a per-call store
 * would make the filesystem adapter re-check its root on every write.
 */
export function blobStore(): BlobStore {
  if (cached) return cached
  const s3 = s3ConfigFromEnv()
  cached = s3 ? createS3Store(s3) : createFilesystemStore(filesystemRoot())
  return cached
}

/** Test seam: swap the store, or drop the cache after changing env. */
export function __setBlobStore(store: BlobStore | null): void {
  cached = store
}

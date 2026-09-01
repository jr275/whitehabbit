import "server-only"

/* ================================================================== *
 * FILESYSTEM BLOB STORE
 *
 * The default. It is what `npm run dev` uses with no configuration at
 * all, what the test suite uses against a temp directory, and what a
 * single-node deployment with a mounted volume uses in production.
 *
 * HONEST ABOUT ITS LIMITS. It is not replicated, not shared between
 * hosts, and not backed up by anything except whatever backs up the
 * volume. A multi-node deployment must use the S3 adapter — which is
 * exactly why the BlobStore interface exists and why the backend that
 * wrote each artifact is recorded on its row.
 *
 * ENCRYPTION AT REST is the volume's job (LUKS, EBS encryption, the
 * host's disk encryption). We deliberately do NOT encrypt in the
 * application: a key we manage ourselves is a key we can lose, and
 * losing it would destroy the one thing M2 exists to preserve.
 *
 * SAFETY. Every key is validated before it becomes a path, and the
 * resolved path is checked to be inside the root — belt and braces,
 * because a traversal here is an arbitrary file write.
 * ================================================================== */

import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { tmpdir } from "node:os"
import { assertSafeKey, BlobStoreError, type BlobPutOptions, type BlobStat, type BlobStore } from "./types.ts"

export function filesystemRoot(): string {
  const configured = (process.env.KNOWLEDGE_BLOB_DIR ?? "").trim()
  return resolve(configured.length > 0 ? configured : join(tmpdir(), "whitehabbit-knowledge-blobs"))
}

export function createFilesystemStore(rootDir: string = filesystemRoot()): BlobStore {
  const root = resolve(rootDir)

  function pathFor(key: string): string {
    assertSafeKey(key)
    const full = resolve(join(root, key))
    // assertSafeKey already rejects traversal; this catches the case it
    // cannot see — a symlinked or otherwise surprising root.
    if (full !== root && !full.startsWith(root + sep)) {
      throw new BlobStoreError("invalid_key", "Resolved path escaped the blob root.", key)
    }
    return full
  }

  return {
    id: "filesystem",

    async put(key: string, body: Buffer, options: BlobPutOptions): Promise<BlobStat> {
      const full = pathFor(key)
      await mkdir(dirname(full), { recursive: true })

      // Write-then-rename: a crash mid-write must never leave a
      // truncated artifact that later reads as a valid archive.
      const temp = `${full}.${createHash("sha256").update(options.checksum).digest("hex").slice(0, 12)}.tmp`
      try {
        await writeFile(temp, body, { mode: 0o600 })
        await rename(temp, full)
      } catch (err) {
        await rm(temp, { force: true }).catch(() => {})
        throw new BlobStoreError("io_error", `Could not write ${key}: ${(err as Error).message}`, key)
      }
      return { key, size: body.byteLength }
    },

    async get(key: string): Promise<Buffer | null> {
      const full = pathFor(key)
      try {
        return await readFile(full)
      } catch (err) {
        // Absence is normal — retention may have removed it.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
        throw new BlobStoreError("io_error", `Could not read ${key}: ${(err as Error).message}`, key)
      }
    },

    async delete(key: string): Promise<void> {
      await rm(pathFor(key), { force: true })
    },

    async isAvailable(): Promise<boolean> {
      try {
        await mkdir(root, { recursive: true })
        return true
      } catch {
        return false
      }
    },
  }
}

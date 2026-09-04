import "server-only"

/* ================================================================== *
 * INDEXING — extracted text becomes retrievable passages.
 *
 * This is the one place that decides WHETHER a document needs
 * chunking and then makes it so. It sits between two pure things: the
 * chunker (lib/knowledge/chunking.ts, no I/O) and the repository
 * (owner-scoped SQL). It calls no model and no provider — embeddings
 * are the next phase and deliberately not reached from here, so
 * indexing a library costs nothing but CPU and can be re-run freely.
 *
 * WHAT MAKES RE-INDEXING CHEAP. content_hash is sha256 of the exact
 * text that was chunked. Unchanged text hashes the same, so the whole
 * operation short-circuits before it writes anything. That is what
 * lets the job pipeline retry, the worker sweep, and a manual
 * re-index all be safe to run as often as anyone likes.
 * ================================================================== */

import { createHash } from "node:crypto"
import { logger } from "@/lib/observability/logger"
import { chunkContent, type Chunk } from "./chunking"
import * as repo from "./repo"

/**
 * The canonical content hash: sha256 of the UTF-8 bytes of the exact
 * string that gets chunked — knowledge_items.content_text, never the
 * raw HTML. Hashing the HTML would be a different question with the
 * same name: a publisher changing an ad slot would invalidate an
 * index whose text did not change at all.
 *
 * Same construction as lib/auth-password.ts's token hashing, which is
 * this repository's existing convention for sha256-hex.
 */
export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/** A chunk's row id, derived rather than random.
 *
 * Deterministic ids mean a re-index of unchanged content produces the
 * same rows, which keeps diffs and debugging honest. Derived from the
 * item, the position and the chunk's own text, so a chunk whose text
 * changed cannot silently keep an id that something else already
 * cited. (Row identity is still (item_id, ordinal) — see 0007; this
 * is the primary key that carries it.) */
export function chunkId(itemId: string, ordinal: number, chunkHash: string): string {
  return `knc_${createHash("sha256").update(`${itemId}:${ordinal}:${chunkHash}`, "utf8").digest("hex").slice(0, 32)}`
}

export type IndexOutcome =
  /** Chunks written (first time, or content changed). */
  | { status: "indexed"; chunks: number; contentHash: string }
  /** Hash matched and the rows are already there — nothing written. */
  | { status: "unchanged"; chunks: number; contentHash: string }
  /** The item has no extracted prose to chunk. Not an error: an item
   *  can be perfectly valid and still have nothing to retrieve. */
  | { status: "no_content" }
  /** No such item for this owner. Covers deleted-since and, just as
   *  importantly, "belongs to someone else" — the two are
   *  indistinguishable from outside on purpose. */
  | { status: "not_found" }

export interface IndexDeps {
  /** Test seam. Never overridden in production. */
  chunk?: (content: string) => Chunk[]
}

/**
 * Chunks one item and stores the result.
 *
 * Ownership is enforced twice, and both times by the database rather
 * than by a check in this function: repo.getItem filters on
 * (org_id, created_by), and repo.replaceChunks re-filters the same
 * way inside its transaction while holding the row lock. A caller
 * that passes someone else's item id gets "not_found" and writes
 * nothing.
 */
export async function indexItem(
  params: { itemId: string; orgId: string; userId: string | null },
  deps: IndexDeps = {},
): Promise<IndexOutcome> {
  const chunker = deps.chunk ?? ((content: string) => chunkContent(content))

  const item = await repo.getItem(params.itemId, params.orgId, params.userId)
  if (!item) return { status: "not_found" }

  const content = item.content_text ?? ""
  // Whitespace-only text is "no content", not an empty document: the
  // chunker would return nothing and we would stamp a hash claiming
  // this was indexed.
  if (content.trim().length === 0) return { status: "no_content" }

  const hash = contentHash(content)

  // The cheap path. Checked here to avoid opening a transaction at
  // all, and checked AGAIN inside replaceChunks under the row lock,
  // because between these two lines another worker may finish the
  // same job.
  if (item.content_hash === hash) {
    const existing = await repo.getChunks(params.itemId, params.orgId, params.userId)
    if (existing.length > 0) return { status: "unchanged", chunks: existing.length, contentHash: hash }
    // Hash stamped but no chunks: a previous run died between the two
    // writes. Rebuild rather than leave the document unretrievable.
    logger.warn("knowledge_index_hash_without_chunks", { itemId: params.itemId })
  }

  const chunks = chunker(content)
  if (chunks.length === 0) return { status: "no_content" }

  const outcome = await repo.replaceChunks(
    params.itemId,
    params.orgId,
    params.userId,
    hash,
    chunks.map((c) => ({
      id: chunkId(params.itemId, c.ordinal, contentHash(c.text)),
      ordinal: c.ordinal,
      text: c.text,
      charStart: c.charStart,
      charEnd: c.charEnd,
      tokenEstimate: c.tokenEstimate,
      contentHash: contentHash(c.text),
    })),
  )

  if (outcome.status === "not_found") return { status: "not_found" }
  if (outcome.status === "unchanged") return { status: "unchanged", chunks: outcome.chunks, contentHash: hash }
  return { status: "indexed", chunks: outcome.chunks, contentHash: hash }
}

/** The job entry point. Separated from indexItem so the job layer
 *  owns retry/attempt semantics and this owns the work. */
export async function runIndexJob(itemId: string, orgId: string, userId: string | null, deps: IndexDeps = {}): Promise<IndexOutcome> {
  const started = Date.now()
  const outcome = await indexItem({ itemId, orgId, userId }, deps)
  logger.info("knowledge_index", {
    itemId,
    status: outcome.status,
    chunks: "chunks" in outcome ? outcome.chunks : 0,
    ms: Date.now() - started,
  })
  return outcome
}

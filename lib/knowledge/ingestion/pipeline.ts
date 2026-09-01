import "server-only"

/* ================================================================== *
 * INGESTION PIPELINE — one job, end to end.
 *
 *   claim → fetching → fetch (SSRF-guarded) → extracting → extract
 *         → sanitize → persist → completed
 *
 * Two properties this is built around:
 *
 *   1. NO DATABASE CONNECTION IS HELD ACROSS A NETWORK CALL. The fetch
 *      takes seconds; the writes take milliseconds. Holding a
 *      connection across the fetch is what exhausts a pool (Phase 5
 *      §7.2), and it is a code rule, not a pool-size problem.
 *
 *   2. EVERY STATE CHANGE IS A COMPARE-AND-SWAP. Each transition is
 *      guarded by the status it expects; zero rows updated means
 *      another runner already advanced it, and this one exits rather
 *      than doing the work twice.
 * ================================================================== */

import { createHash } from "node:crypto"
import { query, queryOne } from "@/lib/platform/db"
import { logger } from "@/lib/platform/logger"
import { workerScope } from "../access/worker.ts"
import { archiveDocument, ArchiveError, releaseSupersededArtifacts } from "../archive/index.ts"
import { extractContent, ExtractionError } from "./extraction/index.ts"
import { type ClaimedJob, completeJob, failJob } from "./jobs.ts"
import { persistExtraction } from "./persist.ts"
import { safeFetch, SafeFetchError } from "./safe-fetch.ts"
import type { BlobStore } from "../storage/types.ts"
import { hashCanonicalUrl } from "./url.ts"
import type { ObjectStatus } from "./state.ts"

export interface IngestOutcome {
  objectId: string
  status: "completed" | "failed" | "retrying" | "skipped"
  failureCode?: string
}

/**
 * The network hop, injectable.
 *
 * Production ALWAYS uses the real safeFetch — the default below is the
 * only value any caller passes. Tests substitute a stub so the rest of
 * the pipeline (extraction, sanitization, persistence, state
 * transitions, retry classification) can be exercised against a real
 * database without depending on the public internet. Nothing about the
 * SSRF boundary is weakened: safe-fetch.ts is tested directly, against
 * real sockets, in tests/knowledge/ssrf.test.ts.
 */
export type Fetcher = (url: string) => Promise<Awaited<ReturnType<typeof safeFetch>>>

export interface IngestDeps {
  fetch?: Fetcher
  /** Injectable so tests archive to a temp directory rather than to
   * whatever the environment happens to be configured with. */
  store?: BlobStore
}

/**
 * How many captures of one object survive.
 *
 * The newest is what re-extraction reads. The two before it are what
 * makes "this publisher changed the article after we saved it"
 * answerable — the cheapest insurance in the system, at roughly one
 * gzipped page each. More than three buys nothing any current or
 * planned feature reads.
 */
const ARTIFACTS_KEPT_PER_OBJECT = 3

/**
 * Compare-and-swap a status transition.
 * Returns false when another runner got there first.
 */
async function advance(objectId: string, from: ObjectStatus, to: ObjectStatus): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE knowledge_objects SET status = $1, updated_at = $2
     WHERE id = $3 AND status = $4 AND deleted_at IS NULL
     RETURNING id`,
    [to, Date.now(), objectId, from],
  )
  return row !== null
}

async function markFailed(objectId: string, code: string, userMessage: string): Promise<void> {
  await query(
    `UPDATE knowledge_objects
     SET status = 'failed', failure_code = $1, failure_message = $2, updated_at = $3
     WHERE id = $4 AND status <> 'completed'`,
    [code, userMessage, Date.now(), objectId],
  )
}

/** Put the object back in the queue's waiting room between attempts. */
async function markPendingRetry(objectId: string, code: string, userMessage: string): Promise<void> {
  await query(
    `UPDATE knowledge_objects
     SET status = 'pending', failure_code = $1, failure_message = $2, updated_at = $3
     WHERE id = $4 AND status IN ('fetching', 'extracting')`,
    [code, userMessage, Date.now(), objectId],
  )
}

/**
 * Run one claimed ingestion job.
 *
 * Never throws: every failure becomes a recorded, typed terminal or
 * retryable state, because an unhandled throw here would leave the job
 * 'active' until the reaper noticed.
 */
export async function runIngestJob(job: ClaimedJob, deps: IngestDeps = {}): Promise<IngestOutcome> {
  const log = { jobId: job.id, objectId: job.objectId, workspaceId: job.workspaceId, attempt: job.attempt }

  const object = await queryOne<{ id: string; submitted_url: string; canonical_url: string; status: string }>(
    `SELECT id, submitted_url, canonical_url, status FROM knowledge_objects
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [job.objectId, job.workspaceId],
  )

  if (!object) {
    // Deleted between enqueue and claim. Not an error.
    await completeJob(job.id)
    return { objectId: job.objectId, status: "skipped" }
  }
  if (object.status === "completed") {
    await completeJob(job.id)
    return { objectId: job.objectId, status: "skipped" }
  }

  // ---- pending -> fetching (CAS) ----
  if (!(await advance(job.objectId, "pending", "fetching"))) {
    logger.info("knowledge_ingest_already_claimed", log)
    await completeJob(job.id)
    return { objectId: job.objectId, status: "skipped" }
  }

  try {
    // ---- fetch. NO db connection held across this. ----
    const fetched = await (deps.fetch ?? safeFetch)(object.submitted_url)

    // ---- archive FIRST -------------------------------------------
    // Before any interpretation of the bytes. A page no extractor can
    // read is still permanently re-processable; an extraction failure
    // that lost the document would be the one unrecoverable failure in
    // the system (M2's single hard requirement).
    const scope = workerScope(job.workspaceId)
    const artifact = await archiveDocument(
      scope,
      {
        objectId: job.objectId,
        body: fetched.body,
        contentType: fetched.contentType,
        charset: fetched.charset,
        requestedUrl: object.submitted_url,
        resolvedUrl: fetched.resolvedUrl,
        httpStatus: fetched.status,
      },
      { store: deps.store },
    )

    // Retention runs here rather than in a sweep: a re-fetched object
    // is exactly the moment an older capture becomes superseded, and
    // the newest is never released.
    const released = await releaseSupersededArtifacts(scope, job.objectId, ARTIFACTS_KEPT_PER_OBJECT)
    if (released > 0) logger.info("knowledge_artifacts_released", { ...log, released })

    await advance(job.objectId, "fetching", "extracting")

    // ---- extract + sanitize ----
    // Falling through a tier is normal (the graby sidecar is optional),
    // so it is logged rather than raised.
    const extracted = await extractContent(
      { url: fetched.resolvedUrl, html: fetched.html },
      {
        onFallthrough: (method, reason) =>
          logger.info("knowledge_extract_fallthrough", { ...log, method, reason }),
      },
    )

    // A redirect that landed on an already-saved article: record the
    // resolved URL, but do not create a second object for it.
    const resolvedHash = hashCanonicalUrl(fetched.resolvedUrl)

    // ---- persist. Object row and content in ONE transaction. ----
    const { wordCount } = await persistExtraction(scope, {
      objectId: job.objectId,
      extracted,
      artifactId: artifact.id,
      fetch: {
        resolvedUrl: fetched.resolvedUrl,
        originUrl: fetched.originUrl,
        httpStatus: fetched.status,
      },
    })

    await completeJob(job.id)
    logger.info("knowledge_ingest_completed", {
      ...log,
      method: extracted.method,
      extractorVersion: extracted.extractorVersion,
      siteConfigMatched: extracted.siteConfigMatched,
      confidence: extracted.confidence,
      artifactId: artifact.id,
      wordCount,
      resolvedHash: resolvedHash.slice(0, 12),
    })
    return { objectId: job.objectId, status: "completed" }
  } catch (err) {
    const { code, userMessage } =
      err instanceof SafeFetchError || err instanceof ExtractionError || err instanceof ArchiveError
        ? { code: err.code, userMessage: err.userMessage }
        : { code: "extraction_error", userMessage: "Something went wrong while saving this page." }

    // An extraction that failed AFTER the archive succeeded is fully
    // recoverable without touching the publisher again. Logged
    // explicitly, because "we still have the bytes" is the difference
    // between a retry and a re-fetch.
    if (!(err instanceof SafeFetchError) && !(err instanceof ArchiveError)) {
      logger.info("knowledge_ingest_archive_survived", { ...log, failureCode: code })
    }

    const { willRetry } = await failJob(job, code, err instanceof Error ? err.message : String(err))

    if (willRetry) {
      await markPendingRetry(job.objectId, code, userMessage)
      logger.warn("knowledge_ingest_retrying", { ...log, failureCode: code })
      return { objectId: job.objectId, status: "retrying", failureCode: code }
    }

    await markFailed(job.objectId, code, userMessage)
    logger.warn("knowledge_ingest_failed", { ...log, failureCode: code })
    return { objectId: job.objectId, status: "failed", failureCode: code }
  }
}

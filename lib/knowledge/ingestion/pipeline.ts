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
import { extractContent, ExtractionError } from "./extraction/index.ts"
import { countWords, readingTimeSeconds } from "./extraction/sanitize.ts"
import { type ClaimedJob, completeJob, failJob } from "./jobs.ts"
import { safeFetch, SafeFetchError } from "./safe-fetch.ts"
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
}

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

    await advance(job.objectId, "fetching", "extracting")

    // ---- extract + sanitize ----
    const extracted = extractContent({ url: fetched.resolvedUrl, html: fetched.html })

    const wordCount = countWords(extracted.contentText)
    const now = Date.now()
    const contentHash =
      extracted.contentText.length > 0
        ? createHash("sha256").update(extracted.contentText).digest("hex")
        : null

    // A redirect that landed on an already-saved article: record the
    // resolved URL, but do not create a second object for it.
    const resolvedHash = hashCanonicalUrl(fetched.resolvedUrl)

    // ---- persist ----
    await query(
      `UPDATE knowledge_objects SET
         resolved_url = $1, origin_url = $2, http_status = $3,
         title = $4, authors = $5, excerpt = $6, published_at = $7, language = $8,
         site_name = $9, image_url = $10, favicon_url = $11,
         word_count = $12, reading_time_seconds = $13,
         extractor = $14, status = 'completed',
         failure_code = NULL, failure_message = NULL, updated_at = $15
       WHERE id = $16 AND org_id = $17`,
      [
        fetched.resolvedUrl,
        fetched.originUrl,
        fetched.status,
        extracted.title,
        extracted.authors,
        extracted.excerpt,
        extracted.publishedAt,
        extracted.language,
        extracted.siteName,
        extracted.imageUrl,
        extracted.faviconUrl,
        wordCount > 0 ? wordCount : null,
        wordCount > 0 ? readingTimeSeconds(wordCount) : null,
        extracted.extractor,
        now,
        job.objectId,
        job.workspaceId,
      ],
    )

    await query(
      `INSERT INTO knowledge_content (object_id, org_id, content_html, content_text, content_hash, extracted_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (object_id) DO UPDATE SET
         content_html = EXCLUDED.content_html,
         content_text = EXCLUDED.content_text,
         content_hash = EXCLUDED.content_hash,
         extracted_at = EXCLUDED.extracted_at`,
      [job.objectId, job.workspaceId, extracted.contentHtml, extracted.contentText, contentHash, now],
    )

    await completeJob(job.id)
    logger.info("knowledge_ingest_completed", {
      ...log,
      extractor: extracted.extractor,
      wordCount,
      resolvedHash: resolvedHash.slice(0, 12),
    })
    return { objectId: job.objectId, status: "completed" }
  } catch (err) {
    const { code, userMessage } =
      err instanceof SafeFetchError || err instanceof ExtractionError
        ? { code: err.code, userMessage: err.userMessage }
        : { code: "extraction_error", userMessage: "Something went wrong while saving this page." }

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

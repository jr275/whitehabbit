import "server-only"

/* ================================================================== *
 * BACKFILL — bringing items saved before this pipeline existed into
 * it, and repairing anything the pipeline itself left behind.
 *
 * WHY THIS IS NOT A MIGRATION. A migration runs once, inside a
 * transaction, with no budget for third-party latency or failure.
 * Embedding and understanding a library is the opposite: they are
 * slow, they cost money per passage, they fail partway, and they must
 * be resumable. So this is a survey plus an enqueue onto the queue
 * that already exists, and the work itself is done by runIndexJob and
 * extractConceptsForItem exactly as it is for a newly-saved item.
 * There is deliberately no second queue, no second worker and no
 * second definition of what "indexed" or "analyzed" means.
 *
 * WHY THIS FILE IS MOSTLY QUERIES. The hard part — doing the work
 * idempotently — was already solved: indexItem() re-chunks only when
 * content_hash changed, embedItemChunks() asks for "chunks with no
 * vector from the current model" rather than "chunks of an unfinished
 * item", and replaceItemConcepts() replaces an item's concepts in one
 * transaction rather than appending to them. Running any of the three
 * twice is a no-op. What was missing is the ability to FIND the items
 * that need them, which is what this adds.
 *
 * NOTHING HERE RUNS ANYTHING. countBacklog and findBackfillCandidates
 * are reads. enqueueBackfill writes queue rows and nothing else — the
 * existing tick drains them.
 * ================================================================== */

import { query } from "@/lib/db/client"
import { logger } from "@/lib/observability/logger"
import { resolveEmbeddingProvider } from "@/lib/ai/embeddings"
import * as repo from "./repo"

/** never_indexed  — a ready item with no chunks at all: saved before
 *                   chunking existed, or its index job never ran
 *  stale_chunks   — chunks exist but were built from different text
 *                   (content_hash moved on)
 *  never_analyzed — chunks exist, but nothing has ever successfully
 *                   looked at them: no concepts, and no concepts job
 *                   that ran to completion. Either the item predates
 *                   migration 0010, or its extraction failed.
 *  missing_vectors— chunks are current, but some have no embedding
 *                   from the model this deployment is configured with */
export type BackfillReason = "never_indexed" | "stale_chunks" | "never_analyzed" | "missing_vectors"

export interface BackfillCandidate {
  itemId: string
  orgId: string
  createdBy: string | null
  reason: BackfillReason
  chunks: number
  embeddedChunks: number
}

export interface BackfillScope {
  /** Required. There is no cross-tenant survey: a backfill reads and
   *  writes real rows, and an unscoped one is a data-leak shaped hole
   *  waiting for its first caller. */
  orgId: string
  /** Null means org-owned rows with no individual owner, matching the
   *  IS NOT DISTINCT FROM semantics used everywhere else. */
  userId: string | null
}

/* WHAT "NEVER ANALYZED" MEANS, and why it is two conditions rather
 * than one.
 *
 * "No concept rows" alone is wrong, because it cannot tell three
 * different things apart: an item nobody ever looked at, an item the
 * model read and honestly found nothing specific in, and an item whose
 * extraction broke. Selecting on it would re-spend a model call on the
 * second group on every single run — the opposite of idempotent.
 *
 * A COMPLETED concepts job is the missing fact. It says "we looked",
 * whatever the answer was, and it is already recorded: the queue keeps
 * its rows. So an item needs analysis when it has no concepts AND no
 * concepts job has ever completed for it. A job that exhausted its
 * retries is `failed`, not `done`, so a real failure comes back round
 * — which is the whole point — while an honest empty result does not.
 *
 * Correlated EXISTS rather than joins: knowledge_item_concepts and
 * knowledge_jobs are both one-to-many, and joining either into the
 * grouped query below would multiply the chunk and embedding counts
 * it depends on.
 *
 * Both halves are owner-scoped against the ITEM's own owner, not the
 * caller's: the outer query has already constrained the item to the
 * caller's scope, and reading ownership off the row means a concept or
 * job belonging to someone else can never satisfy — or suppress — a
 * candidate here. */
const UNANALYZED_PREDICATE = `(
        NOT EXISTS (
          SELECT 1 FROM knowledge_item_concepts ic
           WHERE ic.item_id = i.id
             AND ic.org_id = i.org_id
             AND ic.created_by IS NOT DISTINCT FROM i.created_by
        )
        AND NOT EXISTS (
          SELECT 1 FROM knowledge_jobs j
           WHERE j.item_id = i.id
             AND j.org_id = i.org_id
             AND j.created_by IS NOT DISTINCT FROM i.created_by
             AND j.job_type = 'concepts'
             AND j.status = 'done'
        )
      )`

/* The chunk/vector conditions share one shape, so they cannot drift
 * apart: count this item's chunks, and count how many carry a vector
 * from the CURRENT model. A model change is therefore indistinguishable
 * from a missing vector, which is correct — both need the same work.
 * The analysis condition rides along as the boolean above, computed
 * per item rather than counted.
 *
 * `status = 'ready'` and a non-empty content_text are the definition
 * of "there is something to index" used by indexItem(); repeating it
 * here rather than importing a predicate is deliberate, because this
 * one has to be expressible in SQL. */
const CANDIDATE_SQL = `
  SELECT i.id                AS item_id,
         i.org_id            AS org_id,
         i.created_by        AS created_by,
         i.content_hash      AS item_hash,
         COUNT(c.id)                                        AS chunk_count,
         COUNT(c.id) FILTER (WHERE c.content_hash IS DISTINCT FROM i.content_hash) AS stale_count,
         COUNT(e.chunk_id)                                  AS embedded_count,
         ${UNANALYZED_PREDICATE}                            AS unanalyzed
    FROM knowledge_items i
    LEFT JOIN knowledge_chunks c
      ON c.item_id = i.id
    LEFT JOIN knowledge_chunk_embeddings e
      ON e.chunk_id = c.id AND e.model = $3
   WHERE i.org_id = $1
     AND i.created_by IS NOT DISTINCT FROM $2
     AND i.status = 'ready'
     AND i.archived = FALSE
     AND i.content_text IS NOT NULL
     AND length(btrim(i.content_text)) > 0
   GROUP BY i.id, i.org_id, i.created_by, i.content_hash, i.created_at
  HAVING COUNT(c.id) = 0
      OR COUNT(c.id) FILTER (WHERE c.content_hash IS DISTINCT FROM i.content_hash) > 0
      OR COUNT(e.chunk_id) < COUNT(c.id)
      OR (COUNT(c.id) > 0 AND ${UNANALYZED_PREDICATE})
   ORDER BY i.created_at ASC`

interface CandidateRow {
  item_id: string
  org_id: string
  created_by: string | null
  chunk_count: string | number
  stale_count: string | number
  embedded_count: string | number
  unanalyzed: boolean
}

function toCandidate(row: CandidateRow): BackfillCandidate {
  const chunks = Number(row.chunk_count)
  const stale = Number(row.stale_count)
  const embedded = Number(row.embedded_count)
  return {
    itemId: row.item_id,
    orgId: row.org_id,
    createdBy: row.created_by,
    // PIPELINE ORDER, not amount of work — an item can be several of
    // these at once and only one job can be queued for it, so the
    // reason chosen decides which stage runs first. Chunks must exist
    // and be current before anything can read them; understanding
    // comes next; vectors last, because that is the one stage designed
    // to fail open (see docs/knowledge-semantic-search.md) and can be
    // permanently unavailable in a deployment with no embedding key.
    //
    // Ranking missing_vectors above never_analyzed would mean that in
    // exactly such a deployment every chunked item reports
    // missing_vectors forever and no item is ever analyzed — the
    // concepts backfill would be unreachable rather than merely slow.
    //
    // Nothing is lost by the item that is both: whichever job runs
    // first completes, and the next run picks up the other.
    reason:
      chunks === 0
        ? "never_indexed"
        : stale > 0
          ? "stale_chunks"
          : row.unanalyzed
            ? "never_analyzed"
            : "missing_vectors",
    chunks,
    embeddedChunks: embedded,
  }
}

/**
 * Items in this scope that the pipeline has not fully processed.
 *
 * Read-only. Safe to call at any time, including when no embedding
 * provider is configured — in that case every chunked item reports
 * `missing_vectors`, which is the truth: the vectors are missing, and
 * they will stay missing until a provider exists.
 */
export async function findBackfillCandidates(
  scope: BackfillScope,
  options: { limit?: number; model?: string } = {},
): Promise<BackfillCandidate[]> {
  const model = options.model ?? resolveEmbeddingProvider().model
  const limit = Math.max(1, Math.min(options.limit ?? 100, 1000))
  const rows = await query<CandidateRow>(`${CANDIDATE_SQL} LIMIT $4`, [scope.orgId, scope.userId, model, limit])
  return rows.map(toCandidate)
}

export interface BacklogCounts {
  total: number
  neverIndexed: number
  staleChunks: number
  neverAnalyzed: number
  missingVectors: number
}

/** How much work is outstanding, without listing it. The number an
 *  operator watches after a deploy: it should fall to zero and stay
 *  there. */
export async function countBacklog(scope: BackfillScope, options: { model?: string } = {}): Promise<BacklogCounts> {
  const model = options.model ?? resolveEmbeddingProvider().model
  const rows = await query<CandidateRow>(CANDIDATE_SQL, [scope.orgId, scope.userId, model])
  const candidates = rows.map(toCandidate)
  return {
    total: candidates.length,
    neverIndexed: candidates.filter((c) => c.reason === "never_indexed").length,
    staleChunks: candidates.filter((c) => c.reason === "stale_chunks").length,
    neverAnalyzed: candidates.filter((c) => c.reason === "never_analyzed").length,
    missingVectors: candidates.filter((c) => c.reason === "missing_vectors").length,
  }
}

export interface JobCounts {
  /** Waiting to be claimed. */
  queued: number
  /** Claimed and being worked right now. NOT a separate status: the
   *  schema has three (queued | done | failed) and a claim is a LEASE
   *  on a still-queued row. Counting it as plain `queued` would show a
   *  queue that never drains while work is in flight; inventing a
   *  `running` status would show a bucket that is always zero. */
  leased: number
  failed: number
  done: number
}

/**
 * Job rows in this scope, by real state.
 *
 * The numbers that tell an operator whether a backlog is being worked
 * or is stuck: `leased` moving with `done` climbing is progress; a flat
 * `queued` with nothing leased means the tick is not running, and a
 * climbing `failed` means it is running and losing.
 *
 * Scoped like everything else — queue depth is operational information
 * about someone's library, and it leaks less than content but it still
 * leaks.
 */
export async function countJobs(scope: BackfillScope): Promise<JobCounts> {
  const rows = await query<{ status: string; leased: boolean; n: string }>(
    `SELECT status, (locked_at IS NOT NULL) AS leased, count(*) AS n
       FROM knowledge_jobs
      WHERE org_id = $1 AND created_by IS NOT DISTINCT FROM $2
      GROUP BY status, (locked_at IS NOT NULL)`,
    [scope.orgId, scope.userId],
  )

  const counts: JobCounts = { queued: 0, leased: 0, failed: 0, done: 0 }
  for (const row of rows) {
    const n = Number(row.n)
    if (row.status === "queued") {
      if (row.leased) counts.leased += n
      else counts.queued += n
    } else if (row.status === "failed") {
      counts.failed += n
    } else if (row.status === "done") {
      counts.done += n
    }
  }
  return counts
}

export interface BackfillEnqueueResult {
  candidates: number
  enqueued: number
  /** Already had a queued job. Not a failure — the constraint that
   *  causes it is what makes running this twice harmless. */
  alreadyQueued: number
}

/**
 * Queues one job per candidate, on the EXISTING queue.
 *
 * WHICH JOB. The candidate's reason decides: an item that still needs
 * chunks or vectors gets an `index` job, an item that only needs
 * understanding gets a `concepts` job. Nothing here runs the work and
 * nothing here re-implements a stage — the same tick drains both, and
 * a completed index job chains its own concepts job exactly as it does
 * for a newly-saved item, so `ingest → index → concepts` holds for a
 * backfilled item and a fresh one alike.
 *
 * Idempotent by construction rather than by checking first: the
 * partial unique index uq_knowledge_jobs_item_open allows one queued
 * job per item, so a second run against the same library adds
 * nothing. Two operators running it simultaneously is likewise safe —
 * the database, not this function, is what enforces it. That index is
 * across job TYPES, which is also why only one job is queued per item
 * here: the pipeline, not this loop, decides what comes next.
 *
 * Ownership is copied from the item row rather than from the caller,
 * so a job can never be queued under a scope its item does not have.
 */
export async function enqueueBackfill(
  scope: BackfillScope,
  options: { limit?: number; model?: string } = {},
): Promise<BackfillEnqueueResult> {
  const candidates = await findBackfillCandidates(scope, options)
  let enqueued = 0
  let alreadyQueued = 0

  for (const candidate of candidates) {
    // `created` comes from whether the INSERT returned a row. It
    // cannot be inferred from the job itself — a re-observed queued
    // job also has attempts 0 — and counting one as newly enqueued
    // would overstate how much work this run actually started.
    const enqueue =
      candidate.reason === "never_analyzed" ? repo.enqueueConceptJobDetailed : repo.enqueueIndexJobDetailed
    const { job, created } = await enqueue(candidate.itemId, candidate.orgId, candidate.createdBy)
    if (created) enqueued += 1
    else if (job) alreadyQueued += 1
  }

  logger.info("knowledge_backfill_enqueued", {
    orgId: scope.orgId,
    candidates: candidates.length,
    enqueued,
    alreadyQueued,
    analysis: candidates.filter((c) => c.reason === "never_analyzed").length,
  })

  return { candidates: candidates.length, enqueued, alreadyQueued }
}

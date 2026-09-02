import "server-only"

/* ================================================================== *
 * INGESTION SERVICE — the real save→fetch→extract→ready|failed
 * pipeline. Every outbound fetch goes through safeFetch (lib/security/
 * safe-fetch.ts), which revalidates EVERY redirect hop against the
 * shared SSRF guard and pins each connection to an address that guard
 * approved, bounded by a timeout and a response-size cap. The content
 * is extracted from real markup — never fabricated. State transitions
 * are persisted as they happen so a polling client observes genuine
 * progress (saved → fetching → extracting → ready|failed).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { safeFetch, SafeFetchError, type SafeFetchOptions } from "@/lib/security/safe-fetch"
import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"
import { logger } from "@/lib/observability/logger"
import { isAiSummaryConfigured, summarizeText, type AiSummaryDeps } from "./ai-summary"
import { extractFavicon, extractFromHtml } from "./extract"
import * as repo from "./repo"
import type { KnowledgeJobRow, KnowledgeRow } from "./repo"
import { canonicalizeUrlSafe, InvalidKnowledgeUrlError, isCanonicalUrlTooLong, parseSaveableUrl } from "./url"

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 5_000_000 // 5 MB cap — enough for real articles, refuses payload bombs
const USER_AGENT = "WhitehabbitKnowledgeBot/1.0 (+https://whitehabbit.app)"
const FETCH_HEADERS = { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }

/**
 * Run one guarded fetch and translate its failure for a caller.
 *
 * The detail — which address a host resolved to, which redirect was
 * refused, which DNS error came back — is logged server-side and
 * NEVER returned. On the public preview endpoint those differences are
 * an oracle: repeat them over a wordlist and you have mapped an
 * internal network without ever getting a page back.
 */
export interface FetchDeps {
  /** Test seam only. The SSRF guard runs OUTSIDE the transport, on
   * every hop, so substituting it cannot weaken any check — it only
   * removes the socket. */
  transport?: SafeFetchOptions["transport"]
}

async function guardedFetch(
  url: string,
  context: string,
  deps: FetchDeps = {},
): Promise<{ body: Buffer; contentType: string }> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      headers: FETCH_HEADERS,
      transport: deps.transport,
    })
    return { body: res.body, contentType: res.contentType }
  } catch (err) {
    if (err instanceof SafeFetchError) {
      logger.warn("knowledge_fetch_refused", { context, code: err.code, detail: err.detail })
      throw new SaveValidationError(err.userMessage)
    }
    logger.error("knowledge_fetch_error", { context, message: err instanceof Error ? err.message : String(err) })
    throw new SaveValidationError("We couldn't read that page.")
  }
}

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SaveValidationError"
  }
}

/** AI Summary depends on an external credential (ANTHROPIC_API_KEY)
 *  this deployment may not have configured. Deliberately local (not
 *  @/lib/api-error's AiNotConfiguredError): that module imports
 *  next/server, which this file must stay free of to stay importable
 *  from this repo's plain-Node test runner — same reasoning as
 *  lib/knowledge/ai-summary.ts's AiSummaryUpstreamError. The summarize
 *  route translates this into the real HTTP error (503). */
export class ServiceAiNotConfiguredError extends Error {
  constructor(message = "AI Summary is not configured for this deployment.") {
    super(message)
    this.name = "ServiceAiNotConfiguredError"
  }
}

/** Normalize + validate the user-submitted URL string into a real URL.
 * Adds https:// when the user omits a scheme (a very common paste).
 * Rejects a non-http(s) scheme and a URL carrying credentials — see
 * lib/knowledge/url.ts's parseSaveableUrl(), the one shared rule this
 * and guest-store.ts's own normalizeUrl() both enforce. */
export function normalizeUrl(input: string): string {
  let url: URL
  try {
    url = parseSaveableUrl(input)
  } catch (err) {
    if (err instanceof InvalidKnowledgeUrlError) throw new SaveValidationError(err.message)
    throw err
  }
  if (!url.hostname.includes(".")) throw new SaveValidationError("That doesn't look like a valid web address.")
  return url.toString()
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** The outcome of a save: the row, plus whether it was ALREADY in the
 * org's library (a re-save of the same page). When `duplicate` is true
 * the caller must NOT re-run the ingestion pipeline — it just opens the
 * existing item, and jobId is null (a known, pre-existing gap: a
 * stuck duplicate isn't re-triggered by re-saving its URL — out of
 * scope for Commit 12A, unchanged from today's behavior). For a
 * genuinely new item, jobId is the durable job's id — already
 * committed to Postgres by the time this function returns, before the
 * caller's HTTP response is even sent. */
export interface SaveResult {
  row: KnowledgeRow
  duplicate: boolean
  jobId: string | null
}

/** Create the row immediately in `saved` state, enqueue its durable
 * ingestion job, and return both — so the API can respond instantly,
 * the UI can render the new card, and the job already exists in
 * Postgres as the real durability commitment (see enqueueIngestJob's
 * own doc comment) BEFORE the caller even schedules after()'s fast-
 * path claim. Unless the same page (by canonical dedup key) is
 * already saved, in which case the existing item is returned untouched
 * with duplicate=true and no job is enqueued. */
export async function saveUrl(params: { orgId: string; userId: string | null; url: string }): Promise<SaveResult> {
  const normalized = normalizeUrl(params.url)
  // Fail fast on obviously-unsafe URLs before we even persist, so the
  // user gets an immediate 400 rather than a row that will fail async.
  try {
    await assertSafeUrl(normalized)
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      // Generic on purpose. The guard's own message names the address a
      // host resolved to, which confirms that host exists — an oracle
      // an attacker can walk over a wordlist. The detail is logged.
      logger.warn("knowledge_save_refused", { detail: err.message })
      throw new SaveValidationError("We couldn't reach that address.")
    }
    throw err
  }

  const normalizedKey = canonicalizeUrlSafe(normalized)

  // The dedup key is indexed, and a btree index row has a hard byte
  // ceiling. Refuse here, before the database does: past the ceiling
  // Postgres raises an error saveUrl cannot interpret and the user gets
  // a 500 for a URL that will never save however often they retry.
  // Rejected, never truncated — a truncated key silently collides with
  // every other URL sharing its prefix, which turns "too long" into
  // "opens somebody else's article".
  if (normalizedKey && isCanonicalUrlTooLong(normalizedKey)) {
    throw new SaveValidationError("That URL is too long to save.")
  }

  // Already saved BY THIS USER? Return their existing item rather than
  // a duplicate. Scoped by (org, user) — S5: a colleague's item with
  // the same canonical key must never come back here as "yours".
  if (normalizedKey) {
    const existing = await repo.findByNormalizedUrl(params.orgId, params.userId, normalizedKey)
    if (existing) return { row: existing, duplicate: true, jobId: null }
  }

  try {
    const row = await repo.insertSavedItem({
      orgId: params.orgId,
      userId: params.userId,
      url: normalized,
      normalizedUrl: normalizedKey,
      domain: domainOf(normalized),
    })
    // The durable commitment: this job row exists in Postgres before
    // saveUrl returns, well before the caller's HTTP response is
    // sent. If after()'s fast-path claim never runs at all, the item
    // is never silently stuck — it's a real, reclaimable queued job.
    const job = await repo.enqueueIngestJob(row.id, params.orgId, params.userId)
    return { row, duplicate: false, jobId: job.id }
  } catch (err) {
    // Race: a concurrent save inserted the same canonical URL first and
    // tripped the partial unique index. Resolve to that existing item
    // instead of surfacing a raw constraint error.
    if (normalizedKey && err instanceof Error && /duplicate key|unique/i.test(err.message)) {
      const existing = await repo.findByNormalizedUrl(params.orgId, params.userId, normalizedKey)
      if (existing) return { row: existing, duplicate: true, jobId: null }
    }
    throw err
  }
}

/** Read-only page metadata — the DB-free counterpart to runIngestJob().
 * Normalizes + SSRF-guards + size/timeout-caps the fetch, then returns
 * only the presentational metadata a card needs (never body text, never
 * secrets). Powers the public /api/knowledge/preview route so guest mode
 * can show a real thumbnail without doing (CORS-blocked, unsafe) browser
 * scraping. Throws SaveValidationError for bad/unsafe/unreachable URLs. */
export interface PageMetadata {
  url: string
  canonicalUrl: string | null
  domain: string | null
  title: string | null
  excerpt: string | null
  siteName: string | null
  author: string | null
  imageUrl: string | null
  favicon: string | null
  readingMin: number | null
  kind: string
}

export async function fetchPageMetadata(rawUrl: string, deps: FetchDeps = {}): Promise<PageMetadata> {
  const normalized = normalizeUrl(rawUrl)
  const fetchedRaw = await guardedFetch(normalized, "preview", deps)
  const fetched = { html: decodeUtf8(fetchedRaw.body), contentType: fetchedRaw.contentType }

  const domain = domainOf(normalized)
  const isHtml = /text\/html|application\/xhtml/i.test(fetched.contentType)
  if (!isHtml) {
    // A real resource but not HTML we can read metadata from (PDF, etc).
    return {
      url: normalized,
      canonicalUrl: null,
      domain,
      title: null,
      excerpt: null,
      siteName: domain,
      author: null,
      imageUrl: null,
      favicon: null,
      readingMin: null,
      kind: normalized.toLowerCase().endsWith(".pdf") ? "pdf" : "document",
    }
  }

  const x = extractFromHtml(fetched.html, normalized)
  const textKind = x.kind === "article" || x.kind === "document"
  return {
    url: normalized,
    canonicalUrl: x.canonicalUrl ?? null,
    domain,
    title: x.title ?? null,
    excerpt: x.excerpt ?? null,
    siteName: x.siteName ?? domain,
    author: x.author ?? null,
    imageUrl: x.imageUrl ?? null,
    favicon: extractFavicon(fetched.html, normalized) ?? null,
    readingMin: textKind ? (x.readingMin ?? null) : null,
    kind: x.kind,
  }
}

/** Decode a fetched body. Unchanged from the previous implementation:
 * UTF-8 regardless of the declared charset. Widening that is a content
 * change, not a security one, so it is left exactly as it was. */
function decodeUtf8(body: Buffer): string {
  return new TextDecoder("utf-8").decode(body)
}

/**
 * Run the ingestion pipeline for one saved item — the exact same
 * algorithm this codebase has always run (URL already validated at
 * save time, safeFetch/SSRF-guarded fetch, extraction, metadata +
 * tags persisted in one transaction, status transitions as they
 * happen). Idempotent: safe to call again on a failed or interrupted
 * item, which is exactly what a job retry does — a fresh run simply
 * re-fetches and overwrites the same columns with fresh values.
 *
 * UNLIKE the old processItem this replaces, this THROWS on failure
 * instead of swallowing it into a status write. That decision no
 * longer belongs here: claimAndRunJob below is what now decides
 * whether a failure is a mid-retry hiccup (leave knowledge_items
 * alone — the job engine will retry) or a genuinely terminal one
 * (mark the item failed), based on the durable job's own attempt
 * count, which this function has no way to know on its own. This is
 * safe specifically because every caller now goes through
 * claimAndRunJob, which does catch it — there is no longer a bare
 * after() callback with nothing downstream of this function.
 *
 * userId is the item's real owner. Threaded through so every repo
 * call this makes carries its own (org, user) predicate — not a
 * background job that trusts an earlier check happened somewhere
 * else. It comes from the claimed knowledge_jobs row's own persisted
 * org_id/created_by (written at enqueue time from a verified
 * session), never from an unauthenticated caller of the job runner.
 *
 * deps: FetchDeps — the same transport test seam guardedFetch/
 * fetchPageMetadata already expose, threaded through unchanged so a
 * test can exercise this real function's real success/failure paths
 * without a live network call. Never passed by any production call
 * site (claimAndRunJob's own default is {}) — the SSRF guard itself
 * still runs for real either way; only the socket is fakeable.
 */
export async function runIngestJob(id: string, orgId: string, userId: string | null, deps: FetchDeps = {}): Promise<void> {
  await repo.incrementAttempts(id, orgId, userId)
  const item = await repo.getItem(id, orgId, userId)
  if (!item) return // deleted before processing ran, or ownership no longer checks out — nothing to do

  await repo.setStatus(id, orgId, userId, "fetching")

  let fetched: { html: string; contentType: string }
  try {
    const raw = await guardedFetch(item.url, `ingest:${id}`, deps)
    fetched = { html: decodeUtf8(raw.body), contentType: raw.contentType }
  } catch (err) {
    // guardedFetch has already logged the detail; what propagates is
    // the same safe message a stranger would see. SaveValidationError
    // already carries that in .message, so no extra wrapping needed —
    // claimAndRunJob's catch reads err.message uniformly.
    throw err instanceof SaveValidationError ? err : new SaveValidationError("Could not fetch the source.")
  }

  await repo.setStatus(id, orgId, userId, "extracting")

  const isHtml = /text\/html|application\/xhtml/i.test(fetched.contentType)
  const domain = item.domain ?? undefined

  if (!isHtml) {
    // Real content, but not an HTML page we can extract prose from
    // (PDF, video page without OG, etc). Persist it honestly as ready
    // with what we can derive — no fabricated body text.
    const kind = item.url.toLowerCase().endsWith(".pdf") ? "pdf" : "document"
    await repo.saveExtraction(id, orgId, userId, {
      status: "ready",
      kind,
      title: domain ? `${domain} — saved file` : item.url,
      author: null,
      siteName: domain ?? null,
      excerpt: null,
      imageUrl: null,
      favicon: null,
      canonicalUrl: null,
      publishedAt: null,
      wordCount: null,
      readingMin: null,
      lang: null,
      contentText: null,
      rawHtml: null,
      tags: [],
    })
    return
  }

  const extracted = extractFromHtml(fetched.html, item.url)
  // Reading time is only honest for text kinds — never label a video
  // or PDF with an invented "N min read" derived from page chrome.
  const textKind = extracted.kind === "article" || extracted.kind === "document"
  await repo.saveExtraction(id, orgId, userId, {
    status: "ready",
    kind: extracted.kind,
    title: extracted.title ?? (domain ? `Untitled — ${domain}` : "Untitled"),
    author: extracted.author ?? null,
    siteName: extracted.siteName ?? domain ?? null,
    excerpt: extracted.excerpt ?? null,
    imageUrl: extracted.imageUrl ?? null,
    favicon: extractFavicon(fetched.html, item.url) ?? null,
    canonicalUrl: extracted.canonicalUrl ?? null,
    publishedAt: extracted.publishedAt ?? null,
    wordCount: extracted.wordCount ?? null,
    readingMin: textKind ? (extracted.readingMin ?? null) : null,
    lang: extracted.lang ?? null,
    contentText: extracted.contentText ?? null,
    rawHtml: fetched.html.length <= MAX_BYTES ? fetched.html : null,
    tags: extracted.tags,
  })
}

/* ================================================================== *
 * DURABLE JOB ORCHESTRATION (Commit 12A) — claimAndRunJob is the ONE
 * place that turns a claimed knowledge_jobs row into a real
 * runIngestJob call and records the outcome. Both after()'s fast path
 * (targeted by job id) and a future batched worker (Commit 12B) call
 * this exact function — there is no second implementation of "what
 * happens when a job is claimed."
 * ================================================================== */

/** Approved retry policy constants (Commit 12). Backoff after attempt
 * N (1-indexed, i.e. the count AFTER incrementing on that failure):
 * ~30s → ~60s → ~120s → ~240s, capped at 15 minutes, ±20% jitter so a
 * burst of simultaneously-failing jobs doesn't retry in lockstep. */
export const RETRY_BASE_DELAY_MS = 30_000
export const RETRY_MAX_DELAY_MS = 15 * 60_000
export const RETRY_JITTER = 0.2

/** Pure — no I/O, deterministic modulo Math.random() — so it's
 * directly unit-testable without a database. `attempt` is the job's
 * attempts count AFTER this failure is recorded. */
export function computeBackoffMs(attempt: number): number {
  const raw = Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_DELAY_MS)
  const jitterRange = raw * RETRY_JITTER
  const jitter = (Math.random() * 2 - 1) * jitterRange
  return Math.max(0, Math.round(raw + jitter))
}

export interface ClaimAndRunOptions {
  /** Targeted claim of the one job this call is meant to run — the
   *  after() fast path. When set, `limit` is ignored. */
  jobId?: string
  /** Batched claim — for a future scheduled worker (Commit 12B).
   *  Ignored when jobId is set. Defaults to 1. */
  limit?: number
  /** Test seam only — see runIngestJob's own doc comment. Never
   *  passed by any production call site. */
  fetchDeps?: FetchDeps
}

export interface JobRunSummary {
  claimed: number
  succeeded: number
  retried: number
  failed: number
}

/**
 * Atomically claims one or more durable jobs and runs runIngestJob
 * for each — the single orchestration entry point every trigger goes
 * through (see the file header above this section). Never throws to
 * its caller: this is what after()'s bare callback calls directly,
 * with nothing else downstream to catch a rejection, so the same
 * "never crash the request that scheduled it" guarantee the old
 * processItem made is preserved here instead.
 */
export async function claimAndRunJob(opts: ClaimAndRunOptions = {}, workerId: string = `worker_${randomUUID()}`): Promise<JobRunSummary> {
  const summary: JobRunSummary = { claimed: 0, succeeded: 0, retried: 0, failed: 0 }
  try {
    const jobs = opts.jobId
      ? await repo.claimJobById(opts.jobId, workerId).then((j) => (j ? [j] : []))
      : await repo.claimJobs(opts.limit ?? 1, workerId)
    summary.claimed = jobs.length

    for (const job of jobs) {
      await runClaimedJob(job, summary, opts.fetchDeps ?? {})
    }
  } catch (err) {
    // A claim itself failing (e.g. a transient DB error) is the same
    // category of "background invocation must not crash the request
    // that scheduled it" the old processItem guarded against — log,
    // don't throw. The job (if it was ever inserted) simply stays
    // queued for the next attempt, exactly as if this call never ran.
    logger.error("knowledge_job_claim_error", { message: err instanceof Error ? err.message : String(err) })
  }
  return summary
}

/** Runs one already-claimed job and records its outcome. Split out
 * from claimAndRunJob only so the per-job try/catch (one job failing
 * must never stop the rest of a batch) reads clearly. */
async function runClaimedJob(job: KnowledgeJobRow, summary: JobRunSummary, fetchDeps: FetchDeps): Promise<void> {
  try {
    await runIngestJob(job.item_id, job.org_id, job.created_by, fetchDeps)
    await repo.completeJob(job.id)
    summary.succeeded++
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed unexpectedly."
    const attempts = job.attempts + 1
    const terminal = attempts >= job.max_attempts

    if (terminal) {
      await repo.failJob(job.id, { attempts, error: message, retryAt: null })
      // The one point where a durable job's outcome becomes visible
      // on the UI-facing row — knowledge_items.status stays exactly
      // what it always meant, only reached through a durable retry
      // loop instead of a single best-effort attempt.
      await repo.setStatus(job.item_id, job.org_id, job.created_by, "failed", message)
      summary.failed++
    } else {
      const retryAt = Date.now() + computeBackoffMs(attempts)
      await repo.failJob(job.id, { attempts, error: message, retryAt })
      summary.retried++
    }
  }
}

/** The outcome of an on-demand summarize call: the possibly-updated
 *  row, and whether a NEW summary was just generated. `generated:
 *  false` means an existing cached summary was returned untouched —
 *  no repeat API spend for re-opening an already-summarized item. */
export interface SummarizeResult {
  row: KnowledgeRow
  generated: boolean
}

/**
 * Generate (or return the cached) AI summary for one item. On-demand
 * only — this is never called by the ingestion pipeline (runIngestJob
 * above), and a summary once generated is never silently regenerated:
 * a second call for the same item just returns what's already stored.
 * Real cost: exactly one Anthropic Messages API call, and only on a
 * genuine cache miss against an item with real extracted text.
 *
 * Takes the row the caller already fetched (routes already do their
 * own owner-scoped getItem() + NotFoundError, same as retry/patch) —
 * no redundant read here.
 */
export async function summarizeItem(row: KnowledgeRow, orgId: string, userId: string | null, deps: AiSummaryDeps = {}): Promise<SummarizeResult> {
  if (row.summary) return { row, generated: false }

  if (row.status !== "ready" || !row.content_text || row.content_text.trim().length === 0) {
    throw new SaveValidationError("There's no extracted text to summarize yet.")
  }

  if (!isAiSummaryConfigured()) throw new ServiceAiNotConfiguredError()

  const summary = await summarizeText({ title: row.title ?? "", text: row.content_text }, deps)
  const updated = (await repo.setSummary(row.id, orgId, userId, summary)) ?? { ...row, summary }
  return { row: updated, generated: true }
}

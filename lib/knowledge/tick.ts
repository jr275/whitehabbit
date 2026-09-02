import "server-only"

/* ================================================================== *
 * TICK — the pure logic behind POST /api/knowledge/tick, kept free of
 * next/server on purpose (same reasoning documented throughout this
 * directory: lib/knowledge/ai-summary.ts's AiSummaryUpstreamError,
 * lib/knowledge/service.ts's ServiceAiNotConfiguredError — anything
 * that imports next/server breaks this repo's plain-Node test
 * runner). app/api/knowledge/tick/route.ts is a thin wrapper: it reads
 * the real Request/env, calls straight into isAuthorizedCronRequest
 * and drainJobs below, and does nothing else.
 * ================================================================== */

import { timingSafeEqual } from "node:crypto"
import type { JobRunSummary } from "./service"

/** Approved for Commit 12B: a conservative starting point, matched to
 *  the same per-job worst case service.ts's FETCH_TIMEOUT_MS (15s) and
 *  the 12A audit's own margin analysis already established. */
export const DEFAULT_BATCH_SIZE = 3

/** A SOFT budget drainJobs checks BETWEEN rounds (never mid-job — one
 *  claimed batch always runs to completion once started; aborting a
 *  job mid-flight isn't this worker's concern, that's what the lease/
 *  reclaim mechanism is for). Kept comfortably under the route's
 *  maxDuration=60s so there is always real margin left for the auth
 *  check, the in-flight round finishing, and response serialization. */
export const DEFAULT_TIME_BUDGET_MS = 50_000

/** Constant-time-compares a request's Authorization header value
 *  against `Bearer ${secret}`. Returns false — never throws — for a
 *  missing header, an unconfigured secret, or any mismatch. A length
 *  check runs first (cheap; a bearer token's length is not itself
 *  sensitive — this is the documented pattern for verifying a Vercel
 *  Cron secret), then the real byte-for-byte comparison runs in
 *  constant time so a partial match can never be distinguished from a
 *  total mismatch by timing. Takes plain values, not a Request, so it
 *  needs no DOM/Next.js types to unit test — node:crypto is a plain
 *  Node builtin (same as randomUUID elsewhere in this directory), not
 *  next/server, so it's safe to import directly here. */
export function isAuthorizedCronRequest(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false // unconfigured — refuse, never treat as "open"
  if (!authorizationHeader) return false

  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(authorizationHeader)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export interface TickSummary extends JobRunSummary {
  rounds: number
  durationMs: number
}

export interface DrainDeps {
  /** The real claimAndRunJob in production; injectable for tests. */
  claim: (opts: { limit: number }) => Promise<JobRunSummary>
  batchSize?: number
  timeBudgetMs?: number
  /** Test seam only — defaults to the real Date.now. */
  now?: () => number
}

/** Repeatedly claims and runs a bounded batch until either nothing is
 *  claimable right now, or the time budget is nearly spent. Not a
 *  scheduler — a plain loop over the one existing primitive
 *  (claimAndRunJob, injected as `deps.claim`), stopping between —
 *  never during — a round. A failed job inside a round never stops
 *  the rest of that round or any later round: that resilience is
 *  claimAndRunJob's own per-job try/catch, already true regardless of
 *  how many times this loop calls it. */
export async function drainJobs(deps: DrainDeps): Promise<TickSummary> {
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE
  const timeBudgetMs = deps.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
  const now = deps.now ?? Date.now

  const startedAt = now()
  const totals: TickSummary = { claimed: 0, succeeded: 0, retried: 0, failed: 0, stale: 0, rounds: 0, durationMs: 0 }

  while (now() - startedAt < timeBudgetMs) {
    const round = await deps.claim({ limit: batchSize })
    totals.rounds++
    totals.claimed += round.claimed
    totals.succeeded += round.succeeded
    totals.retried += round.retried
    totals.failed += round.failed
    totals.stale += round.stale

    if (round.claimed === 0) break // nothing currently claimable — done for this invocation
  }

  totals.durationMs = now() - startedAt
  return totals
}

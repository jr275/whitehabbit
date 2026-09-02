import "server-only"

/* ================================================================== *
 * RETRY POLICY — real, bounded retries for genuinely transient
 * failures only (section "PHASE 17"). Used by the marketing pipeline
 * for: research/CRM/Slack provider errors (timeout, 5xx, rate limit),
 * and LLM schema-validation failures (a different retry predicate,
 * same backoff mechanics).
 *
 * NEVER retried, by construction — the caller decides retryability
 * via `shouldRetry`, but this module's own helpers encode the rule
 * the whole pipeline follows: permission denials, invalid/missing
 * credentials, validation failures, and a human's own rejection are
 * never transient — retrying them would either be pointless (the
 * human said no) or dangerous (silently re-attempting a call an
 * operator explicitly denied).
 * ================================================================== */

export interface RetryPolicy {
  maxRetries: number
  /** Base delay in ms — actual delay is base * 2^attempt, capped by maxDelayMs. */
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxRetries: 2, baseDelayMs: 300, maxDelayMs: 4000 }

export interface RetryAttemptLog {
  attempt: number
  delayMs: number
  reason: string
}

export interface RetryOutcome<T> {
  result: T
  attempts: number
  log: RetryAttemptLog[]
}

/** A tool-action-shaped result this policy already understands how to
 * classify — real ToolActionResult fields, never a re-implementation
 * of the tool's own logic. */
export interface RetryableResult {
  ok: boolean
  blocked?: boolean
  errorCode?: string
  error?: string
}

/** The one real classification rule for a ToolActionResult: only a
 * genuine provider_error (the external system was reached and failed
 * — timeout, 5xx, rate limit) is transient. A blocked call (missing
 * credential) or any other errorCode (execution_error — e.g. a
 * permission denial surfaced as a result rather than a thrown error)
 * is never retried automatically. */
export function isTransientToolFailure(result: RetryableResult): boolean {
  if (result.ok || result.blocked) return false
  return result.errorCode === "provider_error"
}

function delayForAttempt(attempt: number, policy: RetryPolicy): number {
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calls `fn()`, retrying only while `shouldRetry(result)` is true, up
 * to `policy.maxRetries` additional attempts with exponential backoff.
 * Never retries a thrown error whose type isn't transient by the
 * caller's own contract — `fn` is expected to catch what it can
 * classify and return a result `shouldRetry` can inspect, exactly
 * like every ToolActionResult already does; an unexpected thrown
 * error still propagates immediately, unretried.
 *
 * `getRetryAfterMs` (section 8: "Respect provider Retry-After when
 * available") — when the result carries a real provider-supplied
 * hint (ToolActionResult.retryAfterMs), the actual delay is the
 * LARGER of that hint and the computed exponential backoff — the
 * provider's own stated cooldown is a floor, never shortened by this
 * policy's own guess.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, shouldRetry: (result: T) => boolean, policy: RetryPolicy = DEFAULT_RETRY_POLICY, getRetryAfterMs?: (result: T) => number | undefined): Promise<RetryOutcome<T>> {
  const log: RetryAttemptLog[] = []
  let attempt = 0
  for (;;) {
    const result = await fn(attempt)
    if (!shouldRetry(result) || attempt >= policy.maxRetries) {
      return { result, attempts: attempt + 1, log }
    }
    const retryAfterMs = getRetryAfterMs?.(result)
    const delayMs = Math.max(delayForAttempt(attempt, policy), retryAfterMs ?? 0)
    log.push({ attempt: attempt + 1, delayMs, reason: retryAfterMs ? `transient failure — retrying (honoring provider Retry-After: ${retryAfterMs}ms)` : "transient failure — retrying" })
    await sleep(delayMs)
    attempt += 1
  }
}

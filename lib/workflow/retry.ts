/* ================================================================== *
 * RETRY POLICY (§5) — explicit, real backoff+jitter. Classifies errors
 * by name/message against a real, reviewed allow/deny list — never a
 * blanket "retry anything," never retries a validation or
 * authorization failure (§5's explicit prohibition).
 * ================================================================== */

import type { RetryPolicy } from "./types"

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30_000,
}

/** Exponential backoff with +/-25% jitter — `attempt` is 1-based (the
 * delay before the 2nd attempt uses attempt=1, etc.). Deterministic
 * bounds are asserted in tests; the jitter itself is real randomness. */
export function computeBackoffMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const raw = Math.min(policy.maxBackoffMs, policy.baseMs * Math.pow(policy.backoffMultiplier, attempt - 1))
  const jitterFactor = 0.75 + Math.random() * 0.5 // 0.75x - 1.25x
  return Math.round(raw * jitterFactor)
}

/* Never retried, by name — a real, reviewed list (§5): validation,
 * authorization, tenant-isolation, invalid-URL, invalid-schema, and a
 * deliberate budget stop are never transient conditions. */
const NON_RETRYABLE_NAMES = new Set([
  "ValidationError",
  "InvalidWebsiteUrlError",
  "UnsafeUrlError",
  "UnauthenticatedError",
  "UnauthorizedOrgError",
  "NotFoundError",
  "InvalidWorkflowTransitionError",
  "BudgetExceededError",
  "DraftBlockedError", // a missing/misconfigured LLM credential is a configuration problem, not transient
  "SkillBlockedError",
  "PageNotReadyError",
  "InvalidJsonLdError",
])

/* Retried, by name or message pattern (§5): network timeout, temporary
 * provider failure, rate limit, temporary DB connectivity, external
 * API 5xx. */
const RETRYABLE_NAMES = new Set(["ProviderError"])
const RETRYABLE_MESSAGE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /EAI_AGAIN/,
  /rate limit/i,
  /too many requests/i,
  /\b5\d\d\b/, // a real 5xx status mentioned in the error text
  /connection.*closed/i,
  /network/i,
]

export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (NON_RETRYABLE_NAMES.has(err.name)) return false
  if (RETRYABLE_NAMES.has(err.name)) return true
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(err.message))
}

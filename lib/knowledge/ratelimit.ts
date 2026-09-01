import "server-only"

/* ================================================================== *
 * KNOWLEDGE RATE LIMITS
 *
 * Its own scope table rather than an extension of lib/rate-limit.ts,
 * whose RATE_LIMITS is typed to Workforce scopes — extending it would
 * mean editing a frozen file. Built on the shared Postgres counter,
 * which is correct across concurrent serverless instances.
 * ================================================================== */

import { checkRateLimit } from "@/lib/platform/ratelimit"
import { RateLimitedError } from "@/lib/platform/errors"

export const KNOWLEDGE_RATE_LIMITS = {
  /** Saving is cheap per call but starts real work, so it is capped. */
  knowledge_save: { limit: 30, windowMs: 60_000 },
  /** Reads are generous; the library list is polled while items process. */
  knowledge_read: { limit: 300, windowMs: 60_000 },
  /** Retry starts work again — tighter than save. */
  knowledge_retry: { limit: 10, windowMs: 60_000 },
  /** Re-extraction performs no fetch, so it costs a publisher nothing
   * — but it does read a multi-megabyte blob and re-run the ladder, so
   * it is capped on OUR resources rather than on politeness. */
  knowledge_reextract: { limit: 20, windowMs: 60_000 },
} as const

export async function enforceKnowledgeRateLimit(
  scope: keyof typeof KNOWLEDGE_RATE_LIMITS,
  subject: string,
): Promise<void> {
  const { limit, windowMs } = KNOWLEDGE_RATE_LIMITS[scope]
  const { allowed } = await checkRateLimit(scope, subject, limit, windowMs)
  if (!allowed) {
    throw new RateLimitedError("You're saving very quickly — give it a minute and try again.")
  }
}

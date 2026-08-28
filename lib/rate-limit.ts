import "server-only"

/* Postgres-backed distributed rate limiting — see checkRateLimit() in
 * lib/db/repo.ts for why Postgres (not in-process memory) is correct
 * here across concurrent serverless instances. */

import { checkRateLimit } from "@/lib/db/repo"
import { RateLimitedError } from "@/lib/api-error"

export const RATE_LIMITS = {
  worker_create: { limit: 20, windowMs: 60_000 }, // 20/min per org
  worker_build: { limit: 30, windowMs: 60_000 },
  worker_release: { limit: 30, windowMs: 60_000 },
  worker_run: { limit: 10, windowMs: 60_000 }, // real LLM calls — tighter
  opportunity_review: { limit: 60, windowMs: 60_000 }, // approve/reject — no LLM call, looser
  website_create: { limit: 20, windowMs: 60_000 },
  website_discover: { limit: 5, windowMs: 60_000 }, // triggers a real bounded crawl — tighter
  opportunity_generate: { limit: 10, windowMs: 60_000 }, // triggers a real LLM call (Writer step)
  page_publish: { limit: 30, windowMs: 60_000 },
  merge_candidate_review: { limit: 60, windowMs: 60_000 },
  decision_execute: { limit: 10, windowMs: 60_000 }, // Phase 7 — can dispatch a real workflow/LLM call, same tightness as opportunity_generate
} as const

export async function enforceRateLimit(scope: keyof typeof RATE_LIMITS, subject: string): Promise<void> {
  const { limit, windowMs } = RATE_LIMITS[scope]
  const { allowed } = await checkRateLimit(scope, subject, limit, windowMs)
  if (!allowed) throw new RateLimitedError(`Rate limit exceeded for ${scope.replace("_", " ")} — try again in a minute.`)
}

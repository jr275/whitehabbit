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
  knowledge_save: { limit: 30, windowMs: 60_000 }, // 30 saves/min per org — each triggers a real outbound fetch
  knowledge_retry: { limit: 20, windowMs: 60_000 },
  knowledge_summarize: { limit: 10, windowMs: 60_000 }, // real LLM calls — tighter, matching worker_run
  knowledge_preview: { limit: 40, windowMs: 60_000 }, // unauth metadata/thumbnail lookups per client ip — each is a real outbound fetch

  auth_register: { limit: 10, windowMs: 60_000 }, // account creation per client ip
  auth_forgot_password: { limit: 5, windowMs: 60_000 }, // reset requests per client ip — abuse guard
  auth_reset_password: { limit: 10, windowMs: 60_000 },
} as const

export async function enforceRateLimit(scope: keyof typeof RATE_LIMITS, subject: string): Promise<void> {
  const { limit, windowMs } = RATE_LIMITS[scope]
  const { allowed } = await checkRateLimit(scope, subject, limit, windowMs)
  if (!allowed) throw new RateLimitedError(`Rate limit exceeded for ${scope.replace("_", " ")} — try again in a minute.`)
}

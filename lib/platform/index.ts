/* ================================================================== *
 * PLATFORM — the ONLY shared-code boundary available to the Knowledge
 * Library.
 *
 * Two products live in this repository:
 *
 *   Workforce / Studio   — existing, stable, must not be modified
 *   Knowledge Library    — new, additive
 *
 * Knowledge code may import from "@/lib/platform/*" and from
 * "@/lib/knowledge/*". It may not reach into Workforce internals, and
 * Workforce may not reach into Knowledge. See docs/PHASE-5-*.md §4 and
 * scripts/check-boundaries.mjs, which fails CI on a violation.
 *
 * These are deliberately RE-EXPORTS, not moves. Moving the underlying
 * modules would rewrite imports across ~14 Workforce files for a
 * cosmetic gain, and the Workforce is frozen. This file is therefore
 * the shared contract: if something is not exported here, Knowledge
 * does not get to use it.
 * ================================================================== */

export {
  query,
  queryOne,
  withTransaction,
  getPool,
  DatabaseNotConfiguredError,
} from "@/lib/db/client"

export { requireSession, UnauthenticatedError, UnauthorizedOrgError } from "@/lib/session"
export type { RequestSession } from "@/lib/session"

export { withApiHandler, NotFoundError, ValidationError, RateLimitedError } from "@/lib/api-error"

export { logger, newRequestId } from "@/lib/observability/logger"
export type { LogContext } from "@/lib/observability/logger"

/* Rate limiting and audit are shared INFRASTRUCTURE that happens to
 * live in lib/db/repo.ts. Only these two functions are re-exported —
 * none of that file's Workforce domain functions are. Knowledge
 * defines its own scope table on top of checkRateLimit, because
 * lib/rate-limit.ts's RATE_LIMITS is typed to Workforce scopes and
 * extending it would mean editing a frozen file. */
export { checkRateLimit, recordAudit } from "@/lib/db/repo"

export { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"

export { getRuntimeMode, isProduction } from "@/lib/runtime-mode"

export { cn } from "@/lib/utils"

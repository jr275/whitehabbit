/* Shared rate limiting and audit.
 *
 * These two live in lib/db/repo.ts but are INFRASTRUCTURE, not
 * Workforce domain — none of that file's domain functions are exposed
 * here. Knowledge defines its own scope table on top of
 * checkRateLimit, because lib/rate-limit.ts's RATE_LIMITS is typed to
 * Workforce scopes and extending it would mean editing a frozen file. */
export { checkRateLimit, recordAudit } from "@/lib/db/repo"

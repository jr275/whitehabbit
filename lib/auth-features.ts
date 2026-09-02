import "server-only"

/* Small server-side auth helpers that don't need the full Auth.js /
 * database import graph. Kept separate from lib/auth.ts so lightweight
 * routes (rate-limit subjects, feature flags) don't pull in NextAuth. */

/** Best-effort client IP for pre-session rate limiting. Falls back to a
 * constant so the limiter still functions (globally) if no IP header is
 * present, rather than silently disabling the guard. */
export function clientIpFrom(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}

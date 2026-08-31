import "server-only"

/* ================================================================== *
 * ORIGIN CHECK — the second CSRF layer (finding CSRF-01).
 *
 * The session cookie is already HttpOnly + SameSite=Lax, so a
 * cross-site POST carries no cookie and fails authentication. That is
 * the primary defence and it works (verified: a cross-site POST gets
 * 401).
 *
 * It is also the ONLY defence, which is thin for a mutating API. This
 * adds a second, independent one: a state-changing request must either
 * carry no Origin at all (a same-origin non-browser client, such as
 * curl or a future mobile app) or carry one that matches the host the
 * request was actually sent to.
 *
 * Deliberately NOT an allowlist of configured domains — that would
 * need per-environment configuration and would break preview
 * deployments. Comparing Origin to the request's own Host needs no
 * configuration and cannot drift.
 * ================================================================== */

import { ValidationError } from "@/lib/api-error"
import { logger } from "@/lib/observability/logger"

/** Set by the platform from the real connection rather than by the
 * client end-to-end. Vercel and most proxies set x-forwarded-host;
 * Host is the fallback. */
function requestHost(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-host")
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase()
  return req.headers.get("host")?.trim().toLowerCase() ?? null
}

/**
 * Reject a state-changing request whose Origin is another site.
 *
 * A missing Origin is allowed: browsers always send it on
 * cross-origin requests and on all POSTs, so its absence means the
 * caller is not a browser — and a non-browser client has no ambient
 * cookie to be abused in the first place.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin")
  if (!origin) return

  const host = requestHost(req)
  if (!host) return

  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    throw new ValidationError("This request came from an address we can't verify.")
  }

  if (originHost !== host) {
    // A genuine hit here is either an attack or a proxy
    // misconfiguration, and both are worth seeing.
    logger.warn("pocket2_cross_origin_rejected", { origin: originHost, host })
    throw new ValidationError("This request came from a different site and was not processed.")
  }
}

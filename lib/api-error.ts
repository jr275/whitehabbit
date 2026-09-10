import "server-only"

/* Shared API route error -> HTTP response translation. Every route
 * wraps its handler body in withApiHandler so a thrown error always
 * becomes a real, correctly-coded response and a structured log line
 * — never a silent catch, never a generic 500 for something that was
 * actually "not signed in" or "not your worker". */

import { NextResponse } from "next/server"
import { DatabaseNotConfiguredError } from "@/lib/db/client"
import { logger, newRequestId } from "@/lib/observability/logger"
import { StaleSessionError, UnauthenticatedError, UnauthorizedOrgError } from "@/lib/session"

export class RateLimitedError extends Error {
  constructor(message = "Too many requests — try again shortly.") {
    super(message)
    this.name = "RateLimitedError"
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message)
    this.name = "NotFoundError"
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

/** A real feature that depends on an external credential this
 * deployment hasn't configured — e.g. AI Summary without
 * ANTHROPIC_API_KEY set. Distinct from DatabaseNotConfiguredError
 * (a platform-wide outage) — this is one feature being honestly
 * unavailable, not the whole app. */
export class AiNotConfiguredError extends Error {
  constructor(message = "This AI feature is not configured for this deployment.") {
    super(message)
    this.name = "AiNotConfiguredError"
  }
}

/** A real call to an external service (e.g. the Anthropic Messages
 * API) failed — network error, non-2xx, or an unusable response body.
 * The message is always a safe, generic one set by the caller; the
 * real detail is logged server-side, never returned (same discipline
 * as lib/knowledge/service.ts's guardedFetch). */
export class UpstreamServiceError extends Error {
  constructor(message = "The request couldn't be completed. Try again.") {
    super(message)
    this.name = "UpstreamServiceError"
  }
}

export function withApiHandler(routeName: string, handler: (requestId: string) => Promise<NextResponse>): Promise<NextResponse> {
  const requestId = newRequestId()
  return handler(requestId).catch((err) => {
    if (err instanceof UnauthenticatedError || err instanceof StaleSessionError) {
      // 401, not 403: the correct next step for both is to sign in
      // again, and a distinct status would tell an attacker holding a
      // revoked cookie that the account still exists.
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    if (err instanceof UnauthorizedOrgError || err instanceof NotFoundError) {
      // 404, not 403: a worker that exists in another org should look
      // identical to a worker that doesn't exist at all — never confirm
      // another tenant's resource exists.
      return NextResponse.json({ error: "Not found." }, { status: 404 })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof RateLimitedError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    if (err instanceof UpstreamServiceError) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
    if (err instanceof DatabaseNotConfiguredError) {
      logger.error("database_not_configured", { requestId, route: routeName })
      return NextResponse.json({ error: "The database is not configured. This deployment cannot serve real data yet." }, { status: 503 })
    }
    logger.error("unhandled_route_error", { requestId, route: routeName, message: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 })
  })
}

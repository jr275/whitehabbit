import "server-only"

/* Shared API route error -> HTTP response translation. Every route
 * wraps its handler body in withApiHandler so a thrown error always
 * becomes a real, correctly-coded response and a structured log line
 * — never a silent catch, never a generic 500 for something that was
 * actually "not signed in" or "not your worker". */

import { NextResponse } from "next/server"
import { DatabaseNotConfiguredError } from "@/lib/db/client"
import { logger, newRequestId } from "@/lib/observability/logger"
import { UnauthenticatedError, UnauthorizedOrgError } from "@/lib/session"

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

/** A real state conflict — e.g. an invalid workflow transition, or an
 * action attempted on a resource in the wrong status. Distinct from
 * ValidationError (bad input) — the input was fine, the resource's
 * current state just doesn't allow this action right now. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConflictError"
  }
}

export function withApiHandler(routeName: string, handler: (requestId: string) => Promise<NextResponse>): Promise<NextResponse> {
  const requestId = newRequestId()
  return handler(requestId).catch((err) => {
    if (err instanceof UnauthenticatedError) {
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
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof RateLimitedError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }
    if (err instanceof DatabaseNotConfiguredError) {
      logger.error("database_not_configured", { requestId, route: routeName })
      return NextResponse.json({ error: "The database is not configured. This deployment cannot serve real data yet." }, { status: 503 })
    }
    logger.error("unhandled_route_error", { requestId, route: routeName, message: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 })
  })
}

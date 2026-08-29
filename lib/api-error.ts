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
import { FieldError } from "@/lib/pocket2/domain/validate"
import { ForbiddenError } from "@/lib/pocket2/domain/authz"

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
    /* FINDING API-01: FieldError is what lib/pocket2/domain/validate.ts
     * throws, and it was not handled here — so every malformed request
     * body ("url": 12345, an over-long URL, a missing field) came back
     * as 500 "Something went wrong" AND was written to the error log as
     * an unhandled route error. That misreports a client mistake as a
     * server fault, hides real faults in the noise, and lets anyone
     * fill the error log with one-line requests. */
    if (err instanceof FieldError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 })
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
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

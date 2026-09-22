import "server-only"

/* ================================================================== *
 * SESSION — the ONE place an API route gets its organization context.
 * organizationId always comes from the verified session (never a
 * client-supplied field), and is re-verified against real membership
 * on every call — a forged/stale org id in a tampered cookie can
 * never grant access it doesn't actually have. See section 7 (multi-
 * tenancy) of the production hardening brief.
 * ================================================================== */

import { auth } from "@/lib/auth"
import { resolveSessionSubject } from "@/lib/db/repo"

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in required.")
    this.name = "UnauthenticatedError"
  }
}

/** The token is validly signed but was minted before the account's
 *  session version was bumped — a password reset happened after this
 *  cookie was issued. Distinct from UnauthorizedOrgError so the reason
 *  is visible in logs; both map to the same response. */
export class StaleSessionError extends Error {
  constructor() {
    super("This session ended when the password was changed.")
    this.name = "StaleSessionError"
  }
}

export class UnauthorizedOrgError extends Error {
  constructor() {
    super("This session's organization no longer has access.")
    this.name = "UnauthorizedOrgError"
  }
}

export interface RequestSession {
  userId: string
  organizationId: string
  organizationName: string
  email: string
}

/** Every authenticated API route calls this first. Throws (never
 * silently falls back to a default org) if there's no session, or if
 * the session's org claim doesn't actually check out against real
 * membership rows. Callers translate these into 401/403 — see the
 * withAuth() wrapper below for the common case. */
export async function requireSession(): Promise<RequestSession> {
  const session = await auth()
  const orgId = (session as { organizationId?: string } | null)?.organizationId
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session || !userId || !orgId) throw new UnauthenticatedError()

  // Membership and session version in one query — see
  // resolveSessionSubject. Both are re-read on EVERY request: a JWT is
  // valid because it is signed, so the only place staleness can be
  // caught is here.
  const subject = await resolveSessionSubject(userId, orgId)
  if (!subject.belongs) throw new UnauthorizedOrgError()

  const claimed = (session as { sessionVersion?: unknown }).sessionVersion
  const tokenVersion = typeof claimed === "number" ? claimed : 0
  if (tokenVersion < subject.sessionVersion) throw new StaleSessionError()

  return {
    userId,
    organizationId: orgId,
    organizationName: (session as { organizationName?: string }).organizationName ?? "",
    email: session.user?.email ?? "",
  }
}

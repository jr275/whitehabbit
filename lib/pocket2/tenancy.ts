import "server-only"

/* ================================================================== *
 * POCKET2 TENANCY — the one place a Pocket2 request acquires its
 * organization context and its role.
 *
 * Builds ON the existing lib/session.ts rather than beside it: that
 * module already resolves the session and re-verifies org membership
 * against real rows on every request, and duplicating that logic is
 * exactly the "parallel system" this codebase should avoid. This adds
 * only what Pocket2 needs on top — the caller's ROLE.
 *
 * The invariant this file exists to enforce:
 *
 *   organizationId is DERIVED, never RECEIVED.
 *
 * No route handler, service, or repository function in lib/pocket2
 * accepts an org id from a request body, query string, or header. The
 * only way to obtain one is to call requireTenant() and have the
 * session prove it.
 *
 * The authorization DECISION lives in domain/authz.ts, which is pure.
 * This module only does the resolving.
 * ================================================================== */

import { queryOne } from "@/lib/db/client"
import { requireSession } from "@/lib/session"
import { normalizeRole, requireRole, type Role, type TenantContext } from "@/lib/pocket2/domain/authz"

export { ForbiddenError, hasRole, requireRole } from "@/lib/pocket2/domain/authz"
export type { TenantContext } from "@/lib/pocket2/domain/authz"

/** Reads the caller's role from the membership row. requireSession()
 * has already proven the membership EXISTS; this reads what it grants. */
async function readRole(userId: string, orgId: string): Promise<Role> {
  const row = await queryOne<{ role: string }>(
    "SELECT role FROM memberships WHERE user_id = $1 AND org_id = $2",
    [userId, orgId],
  )
  return normalizeRole(row?.role)
}

/** Every Pocket2 route handler and Server Component starts here. */
export async function requireTenant(): Promise<TenantContext> {
  const session = await requireSession()
  const role = await readRole(session.userId, session.organizationId)
  return {
    orgId: session.organizationId,
    userId: session.userId,
    email: session.email,
    organizationName: session.organizationName,
    role,
  }
}

/** Convenience for routes that both authenticate and authorize. */
export async function requireTenantWithRole(minimum: Role): Promise<TenantContext> {
  const ctx = await requireTenant()
  requireRole(ctx, minimum)
  return ctx
}

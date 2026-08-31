/* ================================================================== *
 * AUTHORIZATION — pure predicates, no I/O.
 *
 * Deliberately separate from lib/pocket2/tenancy.ts. That module
 * RESOLVES a tenant context (session, database, Auth.js); this one
 * only DECIDES what a resolved context is allowed to do. Keeping the
 * decision pure means the rules can be tested exhaustively without
 * standing up a web framework — and a security rule that is awkward
 * to test is a security rule that ends up untested.
 * ================================================================== */

import { ROLE_RANK, type Role } from "./types"

export type { Role } from "./types"

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message)
    this.name = "ForbiddenError"
  }
}

/** Passed explicitly into every service call. A service function that
 * needs tenant scope cannot forget it, because it cannot be called
 * without one. */
export interface TenantContext {
  orgId: string
  userId: string
  email: string
  organizationName: string
  role: Role
}

export function hasRole(ctx: TenantContext, minimum: Role): boolean {
  return ROLE_RANK[ctx.role] >= ROLE_RANK[minimum]
}

/**
 * Assert the caller holds at least `minimum`.
 *
 * V1 grants owner, admin and member the same permissions over saved
 * items — a personal library has one member. The call sites exist now
 * so that team features in a later phase are an edit to the table of
 * requirements, not a retrofit of authorization into code that never
 * had any.
 */
export function requireRole(ctx: TenantContext, minimum: Role): void {
  if (!hasRole(ctx, minimum)) {
    throw new ForbiddenError(
      `This action requires the ${minimum} role; your role in ${ctx.organizationName || "this workspace"} is ${ctx.role}.`,
    )
  }
}

/** An unrecognized role in the database is treated as the LEAST
 * privileged option. An unexpected value must never fail open. */
export function normalizeRole(raw: unknown): Role {
  return raw === "owner" || raw === "admin" || raw === "member" ? raw : "member"
}

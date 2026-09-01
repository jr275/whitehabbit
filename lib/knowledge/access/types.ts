/* ================================================================== *
 * ACCESS SCOPE — the shape.
 *
 * Deliberately in its own module with NO imports. Both ways of
 * obtaining a scope pull in machinery the other must not have: a
 * request-derived scope needs the session (and through it next-auth
 * and next/navigation), while a worker-derived one must stay loadable
 * in a plain Node process with no request context at all. Sharing the
 * TYPE without sharing either dependency is what keeps that true.
 * ================================================================== */

export interface AccessScope {
  /** The authenticated user. */
  readonly userId: string
  /** The tenant. Physically `organizations.id`; called a workspace here. */
  readonly workspaceId: string
}

import "server-only"

/* ================================================================== *
 * ACCESS SCOPE — the ONE place the Knowledge Library maps the shared
 * tenant to its own vocabulary.
 *
 * `organizations` is the physical tenant table and is shared with the
 * Workforce product (Phase 5 R4). It is deliberately not renamed. The
 * Knowledge domain calls a tenant a WORKSPACE, and that translation
 * happens here and nowhere else.
 *
 * Every Knowledge repository function takes an AccessScope. There is
 * no signature that can omit it, which makes tenant scoping a
 * compile-time requirement rather than a convention someone has to
 * remember — the reason removing `typescript.ignoreBuildErrors` was a
 * prerequisite for this milestone.
 * ================================================================== */

import { requireSession } from "@/lib/platform"

export interface AccessScope {
  /** The authenticated user. */
  readonly userId: string
  /** The tenant. Physically `organizations.id`; called a workspace here. */
  readonly workspaceId: string
}

/**
 * Derives the scope from the verified session. The workspace id comes
 * from the session only — never from a request body, query string or
 * path parameter — and `requireSession()` re-verifies membership
 * against the database on every call, so a forged or stale claim in a
 * tampered cookie grants nothing.
 */
export async function requireScope(): Promise<AccessScope> {
  const session = await requireSession()
  return { userId: session.userId, workspaceId: session.organizationId }
}

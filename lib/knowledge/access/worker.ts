import type { AccessScope } from "./types.ts"

/**
 * The scope a BACKGROUND WORKER runs under.
 *
 * A job has no session: nobody is holding a request open while it
 * runs. It does have a tenant — the one recorded on the job row when a
 * request that WAS authenticated enqueued it — and that is the only
 * thing a repository function actually enforces.
 *
 * Deliberately explicit rather than a nullable AccessScope, so every
 * call site reads as a decision. It is NEVER reachable from a request
 * handler: nothing here derives a tenant from user input, it only
 * carries forward one the queue already recorded.
 */
export function workerScope(workspaceId: string): AccessScope {
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    throw new Error("workerScope requires the workspace recorded on the job")
  }
  return { userId: "system", workspaceId }
}

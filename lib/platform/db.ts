/* Shared database access. See lib/platform/index.ts for the boundary
 * rationale — this is a re-export, not a move. */
export { query, queryOne, withTransaction, getPool, DatabaseNotConfiguredError } from "@/lib/db/client"

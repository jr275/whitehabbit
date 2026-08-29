import "server-only"

/* ================================================================== *
 * TENANT-SCOPED DATABASE ACCESS — closes finding DB-03.
 *
 * Before this, cross-tenant WRITES were impossible at the storage
 * layer (composite foreign keys) but cross-tenant READS were prevented
 * only by every repository function remembering its `WHERE org_id`.
 * One missing predicate in future code would have leaked silently.
 *
 * Now every Pocket2 statement runs inside a transaction that has
 * declared which organization it is acting for, and PostgreSQL's
 * row-level security enforces that declaration. A forgotten predicate
 * returns zero rows instead of someone else's data.
 *
 * HOW IT WORKS
 *   withTenant(orgId, fn)
 *     -> BEGIN
 *     -> set_config('pocket2.org_id', orgId, true)   [true = transaction-local]
 *     -> run fn, during which tquery() uses THAT connection
 *     -> COMMIT / ROLLBACK, connection returned to the pool
 *
 * Transaction-local is essential. A session-level SET on a pooled
 * connection would outlive the request and leak one tenant's scope
 * into the next request that happened to reuse the connection — worse
 * than having no RLS at all.
 *
 * AsyncLocalStorage carries the connection so repository functions
 * keep their existing signatures; without it, every function would
 * have to thread a client parameter through, and any function that
 * forgot would silently fall back to an unscoped pool connection.
 *
 * ── DEPLOYMENT REQUIREMENT ──────────────────────────────────────────
 * RLS does NOT apply to superusers, and applies to a table's owner
 * only when FORCE ROW LEVEL SECURITY is set (migration 0004 sets it).
 * DATABASE_URL must therefore point at a NON-SUPERUSER role. Connect as
 * `postgres` and every policy here is inert. See docs and
 * assertRlsIsEffective() below, which turns that misconfiguration into
 * a loud failure rather than a silent one.
 * ================================================================== */

import { AsyncLocalStorage } from "node:async_hooks"
import type { PoolClient, QueryResultRow } from "pg"
import { getPool } from "@/lib/db/client"

interface TenantScope {
  client: PoolClient
  orgId: string
}

const scopeStore = new AsyncLocalStorage<TenantScope>()

export class MissingTenantScopeError extends Error {
  constructor() {
    super(
      "A Pocket2 query ran outside a tenant scope. Every read and write must be inside " +
        "withTenant(orgId, ...) so row-level security knows which organization is acting. " +
        "This is a programming error, not a user-facing condition.",
    )
    this.name = "MissingTenantScopeError"
  }
}

export class TenantScopeConflictError extends Error {
  constructor(outer: string, inner: string) {
    super(`Cannot enter organization ${inner} while already acting for ${outer}.`)
    this.name = "TenantScopeConflictError"
  }
}

/** The organization the current code path is acting for, if any. */
export function currentOrgId(): string | null {
  return scopeStore.getStore()?.orgId ?? null
}

/**
 * Run `fn` as `orgId`, inside one transaction whose RLS scope is set.
 *
 * Nesting the SAME organization reuses the outer transaction, so a
 * service function can call several repository functions without
 * opening a connection per call. Nesting a DIFFERENT organization
 * throws — that is always a bug, and silently honouring it would be a
 * cross-tenant read.
 */
export async function withTenant<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  if (!orgId) throw new MissingTenantScopeError()

  const existing = scopeStore.getStore()
  if (existing) {
    if (existing.orgId !== orgId) throw new TenantScopeConflictError(existing.orgId, orgId)
    return fn()
  }

  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    // Transaction-local: discarded at COMMIT/ROLLBACK, so it cannot
    // outlive the request on a pooled connection.
    await client.query("SELECT set_config('pocket2.org_id', $1, true)", [orgId])
    const result = await scopeStore.run({ client, orgId }, fn)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The ingestion worker's scope.
 *
 * The queue is deliberately cross-tenant: a worker must be able to see
 * that org B has pending work before it knows to act for org B. This
 * grants that visibility on `ingest_jobs` ALONE — the policy in
 * migration 0004 accepts `pocket2.worker` only for that table, so a
 * worker-scoped transaction still cannot read one row of anybody's
 * saved items, reader documents or tags.
 *
 * Everything the worker then does with a claimed job happens inside a
 * normal withTenant(job.orgId, ...).
 */
export async function withWorkerScope<T>(fn: () => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT set_config('pocket2.worker', 'on', true)")
    const result = await scopeStore.run({ client, orgId: "" }, fn)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function requireScope(): TenantScope {
  const scope = scopeStore.getStore()
  if (!scope) throw new MissingTenantScopeError()
  return scope
}

/** Tenant-scoped query. Throws rather than falling back to an
 * unscoped pool connection, so a missing withTenant() surfaces
 * immediately in development instead of quietly disabling RLS. */
export async function tquery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await requireScope().client.query<T>(text, params)
  return result.rows
}

export async function tqueryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await tquery<T>(text, params)
  return rows[0] ?? null
}

/** The live client, for the few places that genuinely need to issue
 * several statements as one unit (they are already inside this
 * transaction — there is no second BEGIN to open). */
export function tenantClient(): PoolClient {
  return requireScope().client
}

/**
 * Verify at runtime that RLS is actually in force for this connection.
 *
 * Enabling policies while connecting as a superuser produces a system
 * that LOOKS protected and is not. This asks the database directly
 * and is intended for a startup or health check, so the
 * misconfiguration is loud.
 */
export async function assertRlsIsEffective(): Promise<{ effective: boolean; reason: string }> {
  const pool = getPool()
  const { rows } = await pool.query<{ is_superuser: boolean; forced: number }>(
    `SELECT rolsuper AS is_superuser,
            (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relforcerowsecurity)::int AS forced
       FROM pg_roles WHERE rolname = current_user`,
  )
  const row = rows[0]
  if (!row) return { effective: false, reason: "Could not determine the current database role." }
  if (row.is_superuser) {
    return {
      effective: false,
      reason:
        "DATABASE_URL connects as a SUPERUSER, which bypasses row-level security entirely. " +
        "Tenant isolation is currently enforced only by application predicates. " +
        "Use the pocket2_app role (see migrations/0004_pocket2_rls.sql).",
    }
  }
  if (row.forced === 0) return { effective: false, reason: "No table has FORCE ROW LEVEL SECURITY set; run migrations." }
  return { effective: true, reason: `Row-level security is in force on ${row.forced} tables for role ${"current_user"}.` }
}

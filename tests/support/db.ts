/* ================================================================== *
 * INTEGRATION TEST HARNESS — real PostgreSQL, real migrations.
 *
 * These tests deliberately do NOT mock the database. Tenant isolation
 * is enforced by SQL predicates, composite foreign keys and row-level
 * security; a mocked client would happily "pass" a test for a
 * constraint that does not exist in the real schema, which is worse
 * than no test at all.
 *
 * TWO CONNECTIONS, ON PURPOSE:
 *
 *   DATABASE_URL      the APPLICATION's connection. Points at the
 *                     non-superuser pocket2_app role, so code under
 *                     test runs with row-level security actually in
 *                     force — exactly as it will in production.
 *
 *   adminPool()       the HARNESS's connection, as superuser. Used to
 *                     create and tear down tenants and to assert on
 *                     raw stored state. A superuser bypasses RLS, so
 *                     this can see everything and verify what the
 *                     application could and could not reach.
 *
 * If the harness used one connection for both, either setup would be
 * blocked by the policies or the application would bypass them — and
 * the suite would prove nothing about isolation.
 * ================================================================== */

import { Pool } from "pg"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

export const hasDatabase = Boolean(process.env.DATABASE_URL)

/** Superuser connection for setup, teardown and raw-state assertions.
 * Falls back to DATABASE_URL when no separate admin URL is configured
 * (a database with no RLS, or a developer running everything as one
 * role). */
const ADMIN_URL = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL

let pool: Pool | null = null

export function testPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: ADMIN_URL, max: 4 })
  return pool
}

/** Explicit alias — reads better at call sites that are deliberately
 * reaching past the application's own permissions. */
export const adminPool = testPool

let appPoolInstance: Pool | null = null

/** A connection with exactly the application's own privileges. Use
 * this to prove what the application CANNOT do. */
export function appPool(): Pool {
  if (!appPoolInstance) appPoolInstance = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  return appPoolInstance
}

/** Applies migrations/*.sql to whatever DATABASE_URL points at, using
 * the same _migrations bookkeeping as scripts/migrate.mjs — so the
 * suite exercises the real schema, not a hand-maintained copy that
 * could drift from production. */
export async function migrate(): Promise<void> {
  const client = testPool()
  await client.query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)")
  const { rows } = await client.query<{ name: string }>("SELECT name FROM _migrations")
  const applied = new Set(rows.map((r) => r.name))
  const dir = path.resolve(__dirname, "../../migrations")
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue
    await client.query(readFileSync(path.join(dir, file), "utf8"))
    await client.query("INSERT INTO _migrations (name, applied_at) VALUES ($1,$2)", [file, Date.now()])
  }
}

/** Removes only Pocket2 rows plus the tenants these tests create.
 * organizations cascades to everything org-scoped, so this cannot
 * leave a partially-deleted tenant behind. */
export async function resetPocket2(): Promise<void> {
  await testPool().query("DELETE FROM organizations WHERE id LIKE 'test_org_%'")
}

export interface Tenant {
  orgId: string
  userId: string
  email: string
}

/** Creates an isolated organization + owner. Ids are prefixed so
 * resetPocket2() can find them and so a stray row is obviously test
 * data if one ever escapes. */
export async function createTenant(label: string, role = "owner"): Promise<Tenant> {
  const orgId = `test_org_${label}`
  const userId = `test_user_${label}`
  const email = `${label}@pocket2.test`
  const now = Date.now()
  const client = testPool()
  await client.query("INSERT INTO organizations (id,name,created_at) VALUES ($1,$2,$3)", [orgId, `Tenant ${label}`, now])
  await client.query("INSERT INTO users (id,email,password_hash,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING", [userId, email, "x", now])
  await client.query("INSERT INTO memberships (user_id,org_id,role,created_at) VALUES ($1,$2,$3,$4)", [userId, orgId, role, now])
  return { orgId, userId, email }
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null }
  if (appPoolInstance) { await appPoolInstance.end(); appPoolInstance = null }
}

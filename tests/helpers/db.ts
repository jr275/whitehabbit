/* ================================================================== *
 * TEST DATABASE HELPER
 *
 * Repository and pipeline tests run against a REAL PostgreSQL, never a
 * mock. The thing under test is usually the SQL predicate itself — does
 * this query scope by tenant? does this partial unique index actually
 * catch the race? — and a mocked client asserts nothing about either.
 *
 * Zero new dependencies: `pg`, which the application already depends
 * on, plus node:test and node:assert from the runtime.
 *
 * Point TEST_DATABASE_URL at a disposable database. The schema is
 * dropped and rebuilt from migrations/ on every run, so tests never
 * inherit state from a previous run, and running the real migration
 * files is itself a check that they apply cleanly and in order.
 * ================================================================== */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import pg from "pg"

const { Pool } = pg

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/whitehabbit_test"

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations")

let pool: pg.Pool | null = null
let prepared = false

export function getTestPool(): pg.Pool {
  if (!pool) pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 8 })
  return pool
}

/**
 * Drops and rebuilds the schema from migrations/. Idempotent per
 * process, so every test file can call it in `before()` without
 * paying for it more than once.
 */
export async function prepareDatabase(): Promise<void> {
  if (prepared) return

  // prepareDatabase() DROPS the schema. Refuse to run against anything
  // that is not obviously a disposable test database — this is the one
  // guard between a mistyped env var and someone's real data.
  const name = new URL(TEST_DATABASE_URL).pathname
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to reset "${name}" — the test database name must contain "test".`)
  }

  const p = getTestPool()
  await p.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
    try {
      await p.query(sql)
    } catch (err) {
      throw new Error(`Migration ${file} failed to apply: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  prepared = true
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    prepared = false
  }
}

export interface TestTenant {
  orgId: string
  userId: string
}

/**
 * An isolated organization + user + membership. Every test creates its
 * own, so tests never collide and can run in any order — and so a test
 * that accidentally leaks across tenants fails loudly instead of
 * passing against shared fixture data.
 */
export async function createTenant(label = "t"): Promise<TestTenant> {
  const p = getTestPool()
  const orgId = `org_${randomUUID()}`
  const userId = `user_${randomUUID()}`
  const now = Date.now()

  await p.query("INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)", [orgId, `${label}-org`, now])
  await p.query("INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)", [
    userId,
    `${label}-${randomUUID()}@example.test`,
    "not-a-real-hash",
    now,
  ])
  await p.query("INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [
    userId,
    orgId,
    now,
  ])

  return { orgId, userId }
}

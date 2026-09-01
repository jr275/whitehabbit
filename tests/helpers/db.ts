/* ================================================================== *
 * TEST DATABASE HELPER
 *
 * Repository tests run against a REAL PostgreSQL, never a mock — the
 * thing under test is the SQL predicate itself (does this query scope
 * by tenant?), and a mocked client would assert nothing.
 *
 * Zero new dependencies: uses `pg`, which the application already
 * depends on, and node:test / node:assert from the runtime.
 *
 * Set TEST_DATABASE_URL to point at a disposable database. The schema
 * is dropped and rebuilt from migrations/ on every run, so tests never
 * inherit state from a previous run.
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

/** Drops and rebuilds the schema from migrations/. Idempotent per process. */
export async function prepareDatabase(): Promise<void> {
  if (prepared) return
  // prepareDatabase() DROPS the schema. Refuse to run against anything
  // that is not obviously a disposable test database.
  if (!/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error(
      `Refusing to reset "${new URL(TEST_DATABASE_URL).pathname}" — the test database name must contain "test".`,
    )
  }
  const p = getTestPool()
  await p.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
    await p.query(sql)
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

/** Creates an isolated org + user. Every test uses its own, so tests
 * never collide and can run in any order. */
export async function createTenant(label = "t"): Promise<TestTenant> {
  const p = getTestPool()
  const orgId = `org_${randomUUID()}`
  const userId = `user_${randomUUID()}`
  const now = Date.now()
  await p.query("INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)", [orgId, `${label}-org`, now])
  await p.query("INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)", [
    userId,
    `${label}-${randomUUID()}@example.test`,
    "x",
    now,
  ])
  await p.query("INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [
    userId,
    orgId,
    now,
  ])
  return { orgId, userId }
}

/** Minimal worker + task + execution rows, so the Workforce repository
 * functions have something real to act on. */
export async function seedWorkforceExecution(t: TestTenant): Promise<{ workerId: string; taskId: string; executionId: string }> {
  const p = getTestPool()
  const now = Date.now()
  const workerId = `worker_${randomUUID()}`
  const taskId = `task_${randomUUID()}`
  const executionId = `exec_${randomUUID()}`

  await p.query(
    `INSERT INTO workers (id, org_id, name, definition, status, tested, created_at, updated_at)
     VALUES ($1, $2, 'Test Worker', '{}'::jsonb, 'draft', false, $3, $3)`,
    [workerId, t.orgId, now],
  )
  await p.query(
    `INSERT INTO tasks (id, org_id, worker_id, skill_id, category, title, status, created_at)
     VALUES ($1, $2, $3, 'skill_test', 'content', 'Test task', 'running', $4)`,
    [taskId, t.orgId, workerId, now],
  )
  await p.query(
    `INSERT INTO executions (id, org_id, worker_id, task_id, status, started_at)
     VALUES ($1, $2, $3, $4, 'running', $5)`,
    [executionId, t.orgId, workerId, taskId, now],
  )
  return { workerId, taskId, executionId }
}

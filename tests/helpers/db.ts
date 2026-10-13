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
 *
 * THE TARGET GUARD. prepareDatabase() runs DROP SCHEMA public CASCADE.
 * The only thing between a mistyped env var and someone's real data is
 * assertDisposableTarget(), so it lives in getTestPool() — the single
 * place every connection comes from — and not only in the function
 * that happens to drop the schema. A test file that reaches for a pool
 * and issues its own DELETE never asked prepareDatabase() for
 * permission; before this, nothing stopped it.
 *
 * Identity is checked by EQUALITY against an allowlist, never by
 * substring: "latest" and "contest" both contain "test".
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

/** Thrown when the target cannot be shown to be disposable. Distinct
 *  from a connection error so a test can assert the REASON, not just
 *  that something failed. */
export class UnsafeTestTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeTestTargetError"
  }
}

/* The policy, stated as data. Extending it is a deliberate edit to this
 * list, not a side effect of naming a database something new. */
const ALLOWED_DATABASES = new Set(["whitehabbit_test"])
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])
const ALLOWED_PROTOCOLS = new Set(["postgres:", "postgresql:"])

/**
 * Refuse any target that cannot be PROVEN disposable.
 *
 * Fails closed on every ambiguity — an unparseable URL, a missing
 * database name, an unexpected scheme — because the caller is about to
 * drop a schema and "probably fine" is not a basis for that.
 *
 * Messages name the rejected database or host, which is useful and not
 * secret. They never carry the URL, which holds a password.
 */
export function assertDisposableTarget(raw: string): void {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new UnsafeTestTargetError("The test database URL could not be parsed.")
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeTestTargetError(`Refusing protocol "${parsed.protocol}" — not a PostgreSQL URL.`)
  }

  const database = parsed.pathname.replace(/^\//, "")
  if (database === "") {
    throw new UnsafeTestTargetError("The test database URL names no database.")
  }
  if (!ALLOWED_DATABASES.has(database)) {
    throw new UnsafeTestTargetError(`Refusing database "${database}" — not in the allowlist.`)
  }

  // url.hostname keeps the brackets on an IPv6 literal.
  const host = parsed.hostname.replace(/^\[|\]$/g, "")
  if (!ALLOWED_HOSTS.has(host)) {
    throw new UnsafeTestTargetError(`Refusing host "${host}" — not in the allowlist.`)
  }
}

/**
 * Two configured targets that disagree mean nobody can say which one
 * the destructive path would reach. That is the ambiguity the guard
 * exists for, so it refuses rather than picking one.
 *
 * Takes both values as arguments instead of reading the environment, so
 * the rule is testable without mutating process.env.
 */
export function assertNoConflictingConfig(testUrl: string, appUrl: string | undefined): void {
  if (appUrl && appUrl !== testUrl) {
    throw new UnsafeTestTargetError(
      "TEST_DATABASE_URL and DATABASE_URL name different targets — refusing to guess which one to reset.",
    )
  }
}

/**
 * The destructive step, with its guard inseparable from it.
 *
 * `run` is injected so a test can prove the negative that matters: on a
 * rejected target the statement is never handed to anything. Observing
 * that the guard threw does not prove that — only counting the calls
 * that never happened does.
 */
export async function resetSchema(target: string, run: (sql: string) => Promise<unknown>): Promise<void> {
  assertDisposableTarget(target)
  assertNoConflictingConfig(target, process.env.DATABASE_URL)
  await run("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
}

export function getTestPool(): pg.Pool {
  if (!pool) {
    // Before the Pool exists, not before the DROP: this is the one
    // place every connection in the suite is created.
    assertDisposableTarget(TEST_DATABASE_URL)
    assertNoConflictingConfig(TEST_DATABASE_URL, process.env.DATABASE_URL)
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 8 })
  }
  return pool
}

/**
 * Drops and rebuilds the schema from migrations/. Idempotent per
 * process, so every test file can call it in `before()` without
 * paying for it more than once.
 */
export async function prepareDatabase(): Promise<void> {
  if (prepared) return

  const p = getTestPool()
  await resetSchema(TEST_DATABASE_URL, (sql) => p.query(sql))

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

/* ================================================================== *
 * DB CLIENT — a real PostgreSQL connection pool (node-postgres).
 *
 * Server-only. Replaces the earlier node:sqlite/local-file client:
 * that was real and durable for local dev, but explicitly NOT durable
 * on Vercel's ephemeral serverless filesystem. This connects to a
 * real, persistent PostgreSQL database (Neon on Vercel; any Postgres
 * locally) via DATABASE_URL — the repo layer's function signatures
 * are unchanged, so nothing above this module had to be rewritten to
 * "know about" the new database.
 *
 * Fails LOUDLY and IMMEDIATELY if DATABASE_URL is missing, rather
 * than silently falling back to a fake/local store — a production
 * deployment with no database configured must show a clear, honest
 * error, never fabricate data.
 * ================================================================== */

import "server-only"
import { Pool, type QueryResultRow } from "pg"

/* Prefer DATABASE_URL (the platform-injected value in production), but
 * fall back to the Neon-provided connection strings that the Vercel/Neon
 * integration exposes (NEON_DATABASE_URL is the pooled endpoint, correct
 * for serverless app queries). This lets the same code run in local/dev
 * environments where only the NEON_* vars are present, WITHOUT weakening
 * the loud-failure guarantee below — if none are set we still throw. */
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_POSTGRES_URL ||
  process.env.NEON_DATABASE_URL_UNPOOLED

declare global {
  // eslint-disable-next-line no-var
  var __whitehabbit_pg_pool__: Pool | undefined
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. WhiteHabbit's production persistence layer requires a real PostgreSQL connection string " +
        "(Vercel/Neon or any Postgres). Set DATABASE_URL as a server-side environment variable — see README/deployment docs. " +
        "This is not a bug to work around: without it, there is no real place to persist Workers, executions, or outputs.",
    )
    this.name = "DatabaseNotConfiguredError"
  }
}

/* A small pool, reused across warm serverless invocations via a
 * global singleton (same pattern the sqlite client used for its
 * connection) — sized conservatively because each function instance
 * gets its own pool, and Postgres (including Neon's pooled endpoint)
 * has a finite total connection budget across all instances. */
function open(): Pool {
  if (!DATABASE_URL) throw new DatabaseNotConfiguredError()
  return new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
}

export function getPool(): Pool {
  if (!globalThis.__whitehabbit_pg_pool__) {
    globalThis.__whitehabbit_pg_pool__ = open()
  }
  return globalThis.__whitehabbit_pg_pool__
}

/** Thin parameterized-query helper — every call site passes real
 * `$1,$2,...` placeholders, never string-interpolated SQL. */
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool()
  const result = await pool.query<T>(text, params)
  return result.rows
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/** A real transaction — used wherever more than one write must
 * succeed or fail together (e.g. build: insert worker_version + mark
 * worker status; release: promote version + update worker). */
export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

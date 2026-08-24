#!/usr/bin/env node
/* ================================================================== *
 * MIGRATION RUNNER — applies migrations/*.sql, in filename order,
 * against DATABASE_URL, tracked in a _migrations table so a rerun is
 * a no-op for already-applied files. No ORM: this project's whole
 * persistence layer is raw parameterized SQL by design (see
 * lib/db/repo.ts) — a migration tool that matched that (rather than
 * pulling in a full ORM's migration DSL) is the smaller dependency.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs
 *   pnpm migrate
 * ================================================================== */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"
const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations")

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[migrate] DATABASE_URL is not set. Refusing to run — there is nothing to migrate against.")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        TEXT PRIMARY KEY,
        applied_at  BIGINT NOT NULL
      );
    `)

    const { rows: appliedRows } = await pool.query("SELECT name FROM _migrations")
    const applied = new Set(appliedRows.map((r) => r.name))

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    let ranAny = false
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip  ${file} (already applied)`)
        continue
      }
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
      console.log(`[migrate] apply ${file} ...`)
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query(sql)
        await client.query("INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)", [file, Date.now()])
        await client.query("COMMIT")
        console.log(`[migrate] done  ${file}`)
        ranAny = true
      } catch (err) {
        await client.query("ROLLBACK")
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        client.release()
      }
    }

    if (!ranAny) console.log("[migrate] database already up to date.")
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err instanceof Error ? err.message : err)
  process.exit(1)
})

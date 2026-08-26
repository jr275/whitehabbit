/* ================================================================== *
 * VITEST GLOBAL SETUP — applies every migration to DATABASE_URL (the
 * exact same migration runner scripts/migrate.mjs uses in dev/prod —
 * no separate "test schema" drifts from the real one), then truncates
 * every tenant-owned table for a clean slate.
 *
 * Fails loudly if no reachable Postgres is configured — the same
 * "never silently degrade" discipline as lib/db/client.ts's
 * DatabaseNotConfiguredError. Tenant-isolation tests are the whole
 * point of this suite; silently skipping them because Postgres wasn't
 * running would be exactly the kind of fake-green result this
 * codebase's philosophy prohibits. Run `pnpm test` with a real,
 * reachable Postgres (see README) — locally: `sudo service postgresql
 * start && createdb whitehabbit_test`.
 * ================================================================== */

import { execFileSync } from "node:child_process"
import path from "node:path"
import pg from "pg"

const TENANT_TABLES = [
  "internal_links",
  "page_versions",
  "pages",
  "content_artifacts",
  "page_briefs",
  "opportunities",
  "entity_merge_candidates",
  "entity_evidence",
  "entity_relationships",
  "entities",
  "website_knowledge_profiles",
  "crawl_links",
  "crawl_pages",
  "crawls",
  "agent_run_steps",
  "agent_runs",
  "websites",
  "outputs",
  "execution_events",
  "executions",
  "tasks",
  "worker_versions",
  "workers",
  "projects",
  "audit_log",
  "memberships",
  "users",
  "organizations",
]

export default async function setup() {
  // globalSetup runs before vitest's `test.env` is applied to worker
  // processes, so the default lives here too (not just in
  // vitest.config.ts) — this sandbox's local test database either way.
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/whitehabbit_test"
  process.env.DATABASE_URL = databaseUrl
  process.env.AUTH_SECRET ??= "test-only-secret-do-not-use-in-production"
  process.env.LLM_DEV_MODE = "true"

  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 })
  try {
    await pool.query("SELECT 1")
  } catch (err) {
    await pool.end().catch(() => {})
    throw new Error(`Could not reach the test database at DATABASE_URL (${databaseUrl}). Start Postgres and create the database first. Original error: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Reuse the real migration runner — the test schema must never drift
  // from what scripts/migrate.mjs applies in dev/prod.
  execFileSync("node", [path.join(__dirname, "..", "..", "scripts", "migrate.mjs")], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" })

  await pool.query(`TRUNCATE TABLE ${TENANT_TABLES.join(", ")} RESTART IDENTITY CASCADE`)
  await pool.end()
}

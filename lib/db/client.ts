/* ================================================================== *
 * DB CLIENT — a real SQLite connection (node:sqlite, Node 22+).
 *
 * Server-only. Never imported from a "use client" file — Next.js will
 * refuse to bundle node:sqlite into client code, which is the correct
 * failure mode if that ever happens by accident.
 *
 * The file lives on local disk (data/whitehabbit.sqlite3). That is a
 * real, durable database for local dev and for any long-running Node
 * deployment. It is NOT durable on ephemeral serverless filesystems
 * (e.g. Vercel functions reset disk between invocations) — swapping
 * DB_PATH for a hosted Postgres/LibSQL connection string is the
 * documented next step for that deployment target; nothing above this
 * module (the repo layer, the runtime, the API routes) would need to
 * change, since they only depend on the exported query functions.
 * ================================================================== */

import "server-only"
import { DatabaseSync } from "node:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { SCHEMA_SQL } from "./schema"

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "whitehabbit.sqlite3")

declare global {
  // eslint-disable-next-line no-var
  var __whitehabbit_db__: DatabaseSync | undefined
}

function open(): DatabaseSync {
  const dir = path.dirname(DB_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(DB_PATH)
  db.exec("PRAGMA journal_mode = WAL;")
  db.exec("PRAGMA foreign_keys = ON;")
  db.exec(SCHEMA_SQL)
  return db
}

/* Reused across hot-reloads in dev (Next.js re-evaluates modules per
 * request in some modes); a global singleton avoids reopening the file
 * and losing the WAL connection on every request. */
export function getDb(): DatabaseSync {
  if (!globalThis.__whitehabbit_db__) {
    globalThis.__whitehabbit_db__ = open()
  }
  return globalThis.__whitehabbit_db__
}

#!/usr/bin/env node
/* ================================================================== *
 * PRODUCTION DB FIX — inspect first, act only if it is safe.
 *
 *   DATABASE_URL='postgres://…' node scripts/fix-production-db.mjs
 *   DATABASE_URL='postgres://…' node scripts/fix-production-db.mjs --apply
 *
 * Run from the repo root (it reads migrations/ from there).
 *
 * WHY A SCRIPT AND NOT `npm run migrate`
 *
 * The runner applies every file the _migrations ledger does not list,
 * in filename order. If that ledger is empty or missing — which happens
 * when a database was provisioned by any path other than the runner —
 * it starts at 0001_init.sql, which is NOT idempotent (it fails on
 * `constraint "fk_workers_released_version" already exists`). The run
 * aborts, nothing is applied, and the failure looks like the migration
 * "not working" rather than like the ledger being out of step.
 *
 * This script establishes which case you are in BEFORE touching
 * anything, and only ever applies 0005 and 0006 — both verified
 * idempotent — never 0001-0004.
 *
 * THE LEDGER IS RECONCILED ONLY AGAINST EVIDENCE.
 *
 * An earlier version of this script backfilled every migration name
 * whenever knowledge_items existed. That is wrong in a way that hides
 * itself: on a database where 0003_auth_product.sql had never run, it
 * wrote "0003 applied" into the ledger, and from then on `npm run
 * migrate` reported "already up to date" while password_reset_tokens
 * and user_interests did not exist. A fix that silently disables a
 * future migration is worse than the bug it fixes. Each name is now
 * reconciled only when the schema itself proves that migration ran —
 * see PROOF below.
 * ================================================================== */

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

// `pg` is resolved from the CURRENT DIRECTORY, not from wherever this
// file happens to sit, so the script can live anywhere as long as you
// run it from the repo root (which it must, to read migrations/).
const pg = createRequire(`${process.cwd()}/`)("pg")

const APPLY = process.argv.includes("--apply")

/** The only files this script will ever execute. Both are idempotent. */
const SAFE_TO_APPLY = ["0005_knowledge_user_scope.sql", "0006_knowledge_jobs.sql"]

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Refusing to guess which database you meant.")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url })
const q = async (sql, args = []) => (await pool.query(sql, args)).rows

function line() { console.log("─".repeat(66)) }

/* ---- schema predicates: what the database can prove about itself --- */

async function hasTable(name) {
  return (await q("SELECT to_regclass($1) IS NOT NULL AS p", [`public.${name}`]))[0].p
}
async function hasColumn(table, column) {
  return (await q(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS p`,
    [table, column],
  ))[0].p
}
async function hasIndex(name) {
  return (await q(
    "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1) AS p",
    [name],
  ))[0].p
}

/**
 * The evidence that each migration actually ran. A migration is
 * reconciled into the ledger ONLY when its proof holds — never because
 * some neighbouring migration's table happens to exist.
 *
 * Each proof names something that migration and only that migration
 * creates, so it cannot be satisfied by a partially-migrated database.
 */
const PROOF = {
  "0001_init.sql":                 () => hasTable("workers"),
  "0002_knowledge.sql":            () => hasTable("knowledge_items"),
  "0003_auth_product.sql":         () => hasTable("password_reset_tokens"),
  "0004_knowledge_dedupe.sql":     () => hasColumn("knowledge_items", "normalized_url"),
  "0005_knowledge_user_scope.sql": () => hasIndex("uq_knowledge_org_user_normalized"),
  "0006_knowledge_jobs.sql":       () => hasTable("knowledge_jobs"),
}
const ALL = Object.keys(PROOF)

/** Evaluates every proof against the database as it is right now. */
async function evidence() {
  const out = {}
  for (const name of ALL) out[name] = await PROOF[name]()
  return out
}

async function ledgerNames() {
  if (!(await hasTable("_migrations"))) return null
  return (await q("SELECT name FROM _migrations ORDER BY name")).map((r) => r.name)
}

try {
  // ── 0. Reach the server before anything else. Without this the first
  //       real query fails deep inside the driver and prints a pg stack
  //       trace — at precisely the moment someone has just pointed this
  //       at production and needs to know, plainly, whether it touched
  //       anything. It has not: nothing is read or written until here.
  try {
    await pool.query("SELECT 1")
  } catch (err) {
    console.error(`\nCould not connect to the database: ${err.message}`)
    console.error("Nothing was read and nothing was written.")
    console.error("\nCheck that DATABASE_URL names the server you meant and that this")
    console.error("host may reach it. The value itself is never printed by this script.")
    process.exit(1)
  }

  // ── 1. Which database is this, really? Printed so a mistake is
  //       visible before anything is written. No credentials shown.
  const [{ db, host }] = await q(
    "SELECT current_database() AS db, inet_server_addr()::text AS host",
  ).catch(() => [{ db: "?", host: "?" }])
  console.log(`\nDatabase: ${db}   server: ${host ?? "(managed)"}\n`)

  // ── 2. The ledger.
  const names = await ledgerNames()
  const applied = names ?? []

  line()
  console.log("LEDGER (_migrations)")
  if (names === null) console.log("  table does not exist")
  else if (applied.length === 0) console.log("  table exists but is EMPTY")
  else for (const n of applied) console.log(`  ${n}`)

  // ── 3. The schema, as it actually is.
  const tables = (await q(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'knowledge%' ORDER BY 1",
  )).map((r) => r.tablename)
  const idx = (await q(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'uq_knowledge%' ORDER BY 1",
  )).map((r) => r.indexname)

  line()
  console.log("SCHEMA")
  console.log(`  knowledge tables : ${tables.join(", ") || "(none)"}`)
  console.log(`  unique indexes   : ${idx.join(", ") || "(none)"}`)

  // ── 4. What the schema PROVES, independent of the ledger.
  const proven = await evidence()

  line()
  console.log("DIAGNOSIS")
  for (const name of ALL) {
    const done = proven[name]
    const inLedger = applied.includes(name)
    const mark = done === inLedger ? "" : "  <-- ledger and schema DISAGREE"
    console.log(`  ${name.padEnd(30)} schema:${done ? "yes" : "no "}  ledger:${inLedger ? "yes" : "no "}${mark}`)
  }

  // ── 5. Refuse on the one shape that means something else is wrong:
  //       the ledger claims work the schema cannot prove. Checked for
  //       EVERY migration, not just the ones this script can apply —
  //       a ledger lying about 0003 is the same class of problem as
  //       one lying about 0006, and neither is safe to write over.
  const lying = ALL.filter((name) => applied.includes(name) && !proven[name])
  if (lying.length > 0) {
    line()
    console.log("STOPPING — the ledger claims migrations the schema does not have:")
    for (const name of lying) console.log(`  ${name}`)
    console.log("\nThat is not the case this script is written for. Show this output")
    console.log("to whoever is fixing it before anything is applied.")
    process.exit(2)
  }

  const missing = SAFE_TO_APPLY.filter((name) => !proven[name])
  // The ledger can be out of step even when the schema needs nothing —
  // a database migrated by hand has the tables and an empty ledger, and
  // leaving it that way means the real runner still starts at 0001 and
  // still fails. So "nothing to apply" is not the same as "nothing to
  // do", and reconciliation below runs in both cases.
  const drift = ALL.filter((name) => proven[name] && !applied.includes(name))

  line()
  if (missing.length === 0) {
    console.log("Nothing to apply — 0005 and 0006 are both already in the schema.")
    if (drift.length === 0) {
      console.log("Ledger already agrees with the schema. If Save is still failing,")
      console.log("the cause is not these migrations.")
      process.exit(0)
    }
    console.log(`Ledger is behind the schema for: ${drift.join(", ")}`)
  } else {
    console.log(`MISSING: ${missing.join(", ")}`)
  }

  if (!APPLY) {
    console.log("\nInspection only. Re-run with --apply to fix.")
    process.exit(0)
  }

  // ── 6. Both files this script applies operate ON knowledge_items:
  //       0005 indexes it, 0006 references it with a foreign key.
  //       Without that table they fail inside Postgres with an error
  //       about a relation the reader has to go and look up. Refuse
  //       first, in this script's own words, and write nothing.
  if (missing.length > 0 && !(await hasTable("knowledge_items"))) {
    line()
    console.log("STOPPING — knowledge_items does not exist.")
    console.log("0005 indexes that table and 0006 references it with a foreign key,")
    console.log("so neither can be applied here. This database is missing")
    console.log("0002_knowledge.sql, which is outside what this script will apply.")
    console.log("\nNothing was written.")
    process.exit(1)
  }

  // ── 7. Apply, one transaction each, and reconcile the ledger so the
  //       next deploy does not hit the same wall.
  await q(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)`)
  for (const file of missing) {
    const sql = readFileSync(`migrations/${file}`, "utf8")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query(
        "INSERT INTO _migrations (name, applied_at) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING",
        [file, Date.now()],
      )
      await client.query("COMMIT")
      console.log(`  applied ${file}`)
    } catch (err) {
      await client.query("ROLLBACK")
      console.error(`  FAILED ${file}: ${err.message}`)
      process.exit(1)
    } finally {
      client.release()
    }
  }

  // ── 8. Reconcile the earlier names ONLY where the schema proves they
  //       ran. Proofs are re-evaluated here because step 7 just changed
  //       the schema. A name with no proof is deliberately left out of
  //       the ledger, so the real runner still applies it later.
  const provenNow = await evidence()
  const inLedgerNow = (await ledgerNames()) ?? []
  const backfill = ALL.filter((name) => !inLedgerNow.includes(name) && provenNow[name])
  const withheld = ALL.filter((name) => !inLedgerNow.includes(name) && !provenNow[name])

  for (const name of backfill) {
    await q("INSERT INTO _migrations (name, applied_at) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING", [name, Date.now()])
  }
  if (backfill.length) console.log(`  ledger reconciled: ${backfill.join(", ")}`)
  if (withheld.length) {
    console.log(`  ledger NOT marked (no schema evidence): ${withheld.join(", ")}`)
    console.log("    ^ left for the real migration runner to apply — this is deliberate.")
  }

  // ── 9. Verify what 0006 was supposed to create.
  const jobIdx = (await q("SELECT indexname FROM pg_indexes WHERE tablename='knowledge_jobs' ORDER BY 1")).map((r) => r.indexname)
  line()
  console.log("VERIFY")
  console.log(`  knowledge_jobs exists : ${await hasTable("knowledge_jobs")}`)
  console.log(`  indexes               : ${jobIdx.join(", ")}`)
  console.log(`  dedup index           : ${(await hasIndex("uq_knowledge_org_user_normalized")) ? "uq_knowledge_org_user_normalized" : "MISSING"}`)
  console.log("\nNow try Save to library. Expect 201.")
} catch (err) {
  // No stack traces. Whatever went wrong, the operator needs the reason
  // and an honest account of how far the run got — every apply above is
  // its own transaction, so the output already names what landed.
  console.error(`\nStopped on an unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  console.error("Anything reported as applied above did land; nothing after this point ran.")
  process.exitCode = 1
} finally {
  await pool.end()
}

#!/usr/bin/env node
/* ================================================================== *
 * F0 VERIFICATION — exercises scripts/fix-production-db.mjs against
 * real PostgreSQL databases, one per scenario.
 *
 * NOT part of `npm test`: every scenario CREATEs and DROPs a database,
 * which needs privileges a unit suite should not require, and takes
 * far longer than a unit suite should. Run it deliberately:
 *
 *   ADMIN_DATABASE_URL='postgres://user:pw@127.0.0.1:5432/postgres' \
 *     node scripts/verify-fix-production-db.mjs
 *
 * Every database it creates is named *_test and dropped at the end; it
 * refuses any name that does not end in _test, so it cannot be aimed
 * at a real database by editing one constant.
 *
 * Scenarios 10 and 11 (Save end-to-end, tenant isolation) need a built
 * server and run only when E2E_BASE is set — see the report for how
 * they were driven.
 * ================================================================== */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const pg = createRequire(`${process.cwd()}/`)("pg")

const ADMIN = process.env.ADMIN_DATABASE_URL
if (!ADMIN) {
  console.error("ADMIN_DATABASE_URL is not set (needs CREATE DATABASE rights).")
  process.exit(1)
}
const adminUrl = new URL(ADMIN)

let passed = 0
const failures = []
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok   ${name}`) }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`) }
}
function section(t) { console.log(`\n${t}`) }

const dbUrl = (name) => { const u = new URL(adminUrl); u.pathname = `/${name}`; return u.toString() }

async function withAdmin(fn) {
  const pool = new pg.Pool({ connectionString: ADMIN })
  try { return await fn(pool) } finally { await pool.end() }
}

/** Builds a database containing exactly the given migration files. */
async function build(name, files) {
  if (!name.endsWith("_test")) throw new Error(`refusing to touch "${name}": not a *_test database`)
  await withAdmin(async (pool) => {
    await pool.query(`DROP DATABASE IF EXISTS ${name}`)
    await pool.query(`CREATE DATABASE ${name}`)
  })
  const pool = new pg.Pool({ connectionString: dbUrl(name) })
  try {
    for (const f of files) await pool.query(readFileSync(`migrations/${f}`, "utf8"))
  } finally { await pool.end() }
}

async function drop(name) {
  if (!name.endsWith("_test")) return
  await withAdmin((pool) => pool.query(`DROP DATABASE IF EXISTS ${name}`))
}

/** Runs the fix script; returns { code, out }. Never throws on non-zero. */
function runFix(name, apply) {
  const args = ["scripts/fix-production-db.mjs", ...(apply ? ["--apply"] : [])]
  try {
    const out = execFileSync(process.execPath, args, {
      env: { ...process.env, DATABASE_URL: dbUrl(name) }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` }
  }
}

async function query(name, sql, args = []) {
  const pool = new pg.Pool({ connectionString: dbUrl(name) })
  try { return (await pool.query(sql, args)).rows } finally { await pool.end() }
}
const ledger = async (name) => (await query(name, "SELECT name FROM _migrations ORDER BY name").catch(() => [])).map((r) => r.name)
const hasTable = async (name, t) => (await query(name, "SELECT to_regclass($1) IS NOT NULL AS p", [`public.${t}`]))[0].p

const M = {
  init: "0001_init.sql", knowledge: "0002_knowledge.sql", auth: "0003_auth_product.sql",
  dedupe: "0004_knowledge_dedupe.sql", scope: "0005_knowledge_user_scope.sql", jobs: "0006_knowledge_jobs.sql",
}
const ALL_FILES = Object.values(M)
const THROUGH_0005 = [M.init, M.knowledge, M.auth, M.dedupe, M.scope]

const created = []
async function scenario(name, files, fn) {
  const db = `f0_${name}_test`
  created.push(db)
  await build(db, files)
  await fn(db)
}

try {
  console.log("F0 VERIFICATION — fix-production-db.mjs\n" + "=".repeat(50))

  /* 1 ---------------------------------------------------------------- */
  section("1. 0001–0005 present, 0006 absent → applies only 0006")
  await scenario("s1", THROUGH_0005, async (db) => {
    const dry = runFix(db, false)
    check("dry run exits 0", dry.code === 0, `exit ${dry.code}`)
    check("dry run names 0006 as missing", /MISSING: 0006_knowledge_jobs\.sql/.test(dry.out))
    check("dry run writes nothing", !(await hasTable(db, "_migrations")))

    const r = runFix(db, true)
    check("apply exits 0", r.code === 0, `exit ${r.code}`)
    check("applied 0006", /applied 0006_knowledge_jobs\.sql/.test(r.out))
    check("did NOT apply 0005", !/applied 0005/.test(r.out))
    check("knowledge_jobs now exists", await hasTable(db, "knowledge_jobs"))
  })

  /* 2 ---------------------------------------------------------------- */
  section("2. 0001–0006 present (ledger consistent) → Nothing to do")
  await scenario("s2", ALL_FILES, async (db) => {
    const pool = new pg.Pool({ connectionString: dbUrl(db) })
    await pool.query("CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)")
    for (const f of ALL_FILES) await pool.query("INSERT INTO _migrations VALUES ($1, 0)", [f])
    await pool.end()

    const r = runFix(db, true)
    check("exits 0", r.code === 0, `exit ${r.code}`)
    check("reports nothing to apply", /Nothing to apply/.test(r.out))
    check("reports the ledger already agrees", /Ledger already agrees/.test(r.out))
    check("applied nothing", !/applied 0/.test(r.out))
  })

  /* 3 ---------------------------------------------------------------- */
  section("3. Empty ledger + full 0001–0006 schema → reconciles only proven migrations")
  await scenario("s3", ALL_FILES, async (db) => {
    const r = runFix(db, true)
    check("exits 0", r.code === 0, `exit ${r.code}`)
    check("applied nothing (schema already complete)", !/applied 0/.test(r.out))
    const l = await ledger(db)
    check("all six reconciled, because all six are proven", l.length === 6, l.join(","))
    check("nothing withheld", !/NOT marked/.test(r.out))
  })

  /* 4 ---------------------------------------------------------------- */
  section("4. Empty ledger, no password_reset_tokens → 0003 must NOT be marked")
  await scenario("s4", [M.init, M.knowledge, M.dedupe, M.scope], async (db) => {
    check("precondition: password_reset_tokens absent", !(await hasTable(db, "password_reset_tokens")))
    const r = runFix(db, true)
    check("exits 0", r.code === 0, `exit ${r.code}`)
    const l = await ledger(db)
    check("0003 is NOT in the ledger", !l.includes(M.auth), l.join(","))
    check("it is reported as withheld", /NOT marked \(no schema evidence\).*0003_auth_product/.test(r.out))
    check("the migrations that ARE proven were reconciled", l.includes(M.init) && l.includes(M.knowledge) && l.includes(M.dedupe) && l.includes(M.scope))
    check("0006 was applied and recorded", l.includes(M.jobs) && (await hasTable(db, "knowledge_jobs")))
    check("password_reset_tokens still absent (nothing invented)", !(await hasTable(db, "password_reset_tokens")))
  })

  /* 5 ---------------------------------------------------------------- */
  section("5. Empty ledger, no knowledge_jobs → 0006 not pre-marked; 0006 applied")
  await scenario("s5", THROUGH_0005, async (db) => {
    const dry = runFix(db, false)
    check("dry run shows 0006 schema:no ledger:no", /0006_knowledge_jobs\.sql\s+schema:no\s+ledger:no/.test(dry.out))
    const r = runFix(db, true)
    check("0006 is applied, not merely recorded", /applied 0006_knowledge_jobs\.sql/.test(r.out))
    check("knowledge_jobs exists", await hasTable(db, "knowledge_jobs"))
    check("ledger now has all six", (await ledger(db)).length === 6)
  })

  /* 6 ---------------------------------------------------------------- */
  section("6. Ledger claims 0003 but password_reset_tokens absent → exit 2, no writes")
  await scenario("s6", [M.init, M.knowledge, M.dedupe, M.scope], async (db) => {
    const pool = new pg.Pool({ connectionString: dbUrl(db) })
    await pool.query("CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)")
    await pool.query("INSERT INTO _migrations VALUES ($1, 0)", [M.auth])
    await pool.end()

    const r = runFix(db, true)
    check("exits 2", r.code === 2, `exit ${r.code}`)
    check("names 0003 as the lie", /STOPPING[\s\S]*0003_auth_product\.sql/.test(r.out))
    check("knowledge_jobs was NOT created", !(await hasTable(db, "knowledge_jobs")))
    check("ledger untouched", (await ledger(db)).length === 1)
  })

  /* 7 ---------------------------------------------------------------- */
  section("7. Ledger claims 0006 but knowledge_jobs absent → exit 2, no writes")
  await scenario("s7", THROUGH_0005, async (db) => {
    const pool = new pg.Pool({ connectionString: dbUrl(db) })
    await pool.query("CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)")
    await pool.query("INSERT INTO _migrations VALUES ($1, 0)", [M.jobs])
    await pool.end()

    const r = runFix(db, true)
    check("exits 2", r.code === 2, `exit ${r.code}`)
    check("names 0006 as the lie", /STOPPING[\s\S]*0006_knowledge_jobs\.sql/.test(r.out))
    check("knowledge_jobs was NOT created", !(await hasTable(db, "knowledge_jobs")))
  })

  /* 8 ---------------------------------------------------------------- */
  section("8. No knowledge_items → exit 1 before attempting 0005/0006")
  await scenario("s8", [M.init], async (db) => {
    const r = runFix(db, true)
    check("exits 1", r.code === 1, `exit ${r.code}`)
    check("refuses in its own words, naming knowledge_items", /STOPPING — knowledge_items does not exist/.test(r.out))
    check("says nothing was written", /Nothing was written/.test(r.out))
    check("does NOT surface a raw Postgres relation error", !/relation "knowledge_items" does not exist/.test(r.out))
    check("knowledge_jobs was NOT created", !(await hasTable(db, "knowledge_jobs")))
    check("no ledger was created", !(await hasTable(db, "_migrations")))
  })

  /* 9 + 12 ------------------------------------------------------------ */
  section("9. Three applies are idempotent   ·   12. No unexpected objects")
  await scenario("s9", THROUGH_0005, async (db) => {
    const objects = async () => (await query(db,
      `SELECT c.relkind::text || ':' || c.relname AS o
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','i') ORDER BY 1`)).map((r) => r.o)
    const columns = async () => (await query(db,
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
        WHERE table_schema='public' ORDER BY 1`)).map((r) => r.c)

    const before = await objects()
    const beforeCols = await columns()

    const codes = []
    for (let i = 0; i < 3; i++) codes.push(runFix(db, true).code)
    check("all three runs exit 0", codes.every((c) => c === 0), codes.join(","))

    const after = await objects()
    const afterCols = await columns()
    const addedObjects = after.filter((o) => !before.includes(o))
    const addedCols = afterCols.filter((c) => !beforeCols.includes(c))
    const removed = before.filter((o) => !after.includes(o))

    const EXPECTED = [
      "r:_migrations", "i:_migrations_pkey",
      "r:knowledge_jobs", "i:knowledge_jobs_pkey",
      "i:idx_knowledge_jobs_claimable", "i:idx_knowledge_jobs_item", "i:uq_knowledge_jobs_item_open",
    ].sort()
    check("exactly the expected objects were added", JSON.stringify(addedObjects.sort()) === JSON.stringify(EXPECTED),
          `added: ${addedObjects.sort().join(", ")}`)
    check("nothing was removed", removed.length === 0, removed.join(", "))
    check("no column added outside the two new tables",
          addedCols.every((c) => c.startsWith("knowledge_jobs.") || c.startsWith("_migrations.")),
          addedCols.filter((c) => !c.startsWith("knowledge_jobs.") && !c.startsWith("_migrations.")).join(", "))

    const l = await ledger(db)
    check("ledger has exactly six rows, no duplicates", l.length === 6 && new Set(l).size === 6, l.join(","))

    // Run once more and compare the whole catalogue: byte-for-byte stable.
    runFix(db, true)
    check("a fourth run changes nothing", JSON.stringify(await objects()) === JSON.stringify(after))
  })

  /* 10 + 11 ----------------------------------------------------------- */
  section("10. Save end-to-end   ·   11. Tenant isolation")
  if (!process.env.E2E_BASE) {
    console.log("  skip  set E2E_BASE (and point the server at a fixed *_test database) to run these")
  } else {
    console.log(`  (driven separately against ${process.env.E2E_BASE} — see report)`)
  }

  console.log("\n" + "=".repeat(50))
  console.log(`${passed} passed, ${failures.length} failed`)
  if (failures.length) { for (const f of failures) console.log(`  - ${f}`) ; process.exitCode = 1 }
} finally {
  for (const db of created) await drop(db).catch(() => {})
}

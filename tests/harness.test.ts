/* ================================================================== *
 * HARNESS SELF-TEST
 *
 * Proves the test setup itself works before any real test relies on
 * it. Every assertion here corresponds to something that, when broken,
 * makes the whole suite fail in a way that looks like a product bug:
 *
 *   1. the "@/..." alias resolves        (scripts/module-alias-hooks)
 *   2. TypeScript is stripped, not compiled — this file is .ts with
 *      real type annotations and no build step
 *   3. `import "server-only"` modules load, which needs the
 *      --conditions=react-server flag the test script passes
 *   4. all migrations apply cleanly, in order, onto an empty schema
 *   5. the tenant fixture produces a real, isolated org + user
 *
 * (4) is not ceremony: it is the only place the real migration files
 * are executed against a real PostgreSQL on every run, so a migration
 * that does not apply is caught here rather than in a deploy.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"

import { canonicalizeUrl, canonicalizeUrlSafe } from "@/lib/knowledge/url"
import * as repo from "@/lib/knowledge/repo"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, TEST_DATABASE_URL } from "./helpers/db"

describe("test harness", () => {
  it("resolves the @/ path alias the way Next.js does", () => {
    assert.equal(typeof canonicalizeUrl, "function")
    assert.equal(typeof canonicalizeUrlSafe, "function")
  })

  it("strips TypeScript types rather than requiring a build step", () => {
    // Real annotations, generics and an interface — if this file were
    // being run as plain JS, none of it would parse.
    interface Shape {
      value: number
    }
    const identity = <T,>(input: T): T => input
    const shape: Shape = { value: 42 }
    assert.equal(identity(shape).value, 42)
  })

  it("loads modules that import 'server-only'", () => {
    // lib/knowledge/repo.ts is server-only and pulls in lib/db/client.
    // It importing at all is the assertion: without
    // --conditions=react-server, `server-only` throws on import.
    assert.equal(typeof repo.listItems, "function")
    assert.equal(typeof repo.findByNormalizedUrl, "function")
  })
})

describe("test database", () => {
  before(async () => {
    await prepareDatabase()
  })
  after(async () => {
    await closeTestPool()
  })

  it("refuses to run against a database that is not obviously disposable", () => {
    assert.match(
      new URL(TEST_DATABASE_URL).pathname,
      /test/i,
      "prepareDatabase() DROPs the schema — the name guard is the only thing between a typo and real data",
    )
  })

  it("applies every migration onto an empty schema", async () => {
    const { rows } = await getTestPool().query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    )
    const tables = rows.map((r) => r.table_name)

    // 0001_init
    for (const t of ["organizations", "users", "memberships"]) {
      assert.ok(tables.includes(t), `0001_init should have created ${t}`)
    }
    // 0002_knowledge — the canonical Knowledge schema
    assert.ok(tables.includes("knowledge_items"))
    assert.ok(tables.includes("knowledge_item_tags"))
    // 0003_auth_product
    assert.ok(tables.includes("password_reset_tokens"))
    assert.ok(tables.includes("user_interests"))

    // The parallel M1 schema must never appear in this repository.
    assert.ok(!tables.includes("knowledge_objects"), "knowledge_objects belongs to the abandoned M1 branch")
    assert.ok(!tables.includes("knowledge_artifacts"), "knowledge_artifacts belongs to the abandoned M1 branch")
  })

  it("applies 0004_knowledge_dedupe's columns and partial unique index", async () => {
    const { rows: cols } = await getTestPool().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'knowledge_items' AND column_name IN ('normalized_url', 'favicon')`,
    )
    assert.equal(cols.length, 2, "0004 adds normalized_url and favicon")

    const { rows: idx } = await getTestPool().query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'knowledge_items' AND indexname = 'uq_knowledge_org_normalized'`,
    )
    assert.equal(idx.length, 1, "0004 adds the dedup index")
  })

  it("creates isolated tenants", async () => {
    const a = await createTenant("alpha")
    const b = await createTenant("beta")

    assert.notEqual(a.orgId, b.orgId)
    assert.notEqual(a.userId, b.userId)

    const { rows } = await getTestPool().query<{ count: string }>(
      "SELECT COUNT(*)::int AS count FROM memberships WHERE user_id = $1 AND org_id = $2",
      [a.userId, a.orgId],
    )
    assert.equal(Number(rows[0].count), 1, "a tenant's user must actually belong to its org")
  })
})

/* ================================================================== *
 * SUMMARIZE — lib/knowledge/service.ts's summarizeItem() against a
 * REAL PostgreSQL (see tests/helpers/db.ts's own header for why): the
 * thing this suite actually characterizes is the cache-hit/cache-miss
 * persistence contract (repo.setSummary, the "never regenerate" rule),
 * which a mocked repo would assert nothing real about. The AI call
 * itself is injected via the same deps.fetchImpl seam ai-summary.test.
 * ts uses — no real network call is ever made here either.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import * as repo from "@/lib/knowledge/repo"
import { ServiceAiNotConfiguredError, SaveValidationError, summarizeItem } from "@/lib/knowledge/service"
import { closeTestPool, createTenant, prepareDatabase, type TestTenant } from "../helpers/db"

let alice: TestTenant
let bob: TestTenant

before(async () => {
  await prepareDatabase()
  alice = await createTenant("alice")
  bob = await createTenant("bob")
})
after(async () => {
  await closeTestPool()
})

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY
after(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY
})

/** Inserts a real, owner-scoped item already in `ready` state with
 *  real extracted body text — the state summarizeItem expects. */
async function readyItem(tenant: TestTenant, contentText: string | null = "Real extracted article body text.") {
  const row = await repo.insertSavedItem({
    orgId: tenant.orgId,
    userId: tenant.userId,
    url: `https://example.test/${randomUUID()}`,
    normalizedUrl: null,
    domain: "example.test",
  })
  await repo.saveExtraction(row.id, tenant.orgId, tenant.userId, {
    status: "ready",
    kind: "article",
    title: "A Real Article",
    author: null,
    siteName: "example.test",
    excerpt: null,
    imageUrl: null,
    favicon: null,
    canonicalUrl: null,
    publishedAt: null,
    wordCount: contentText ? contentText.split(/\s+/).length : null,
    readingMin: 1,
    lang: "en",
    contentText,
    rawHtml: null,
    tags: [],
  })
  return (await repo.getItem(row.id, tenant.orgId, tenant.userId))!
}

function fakeFetch(text = "A concise real summary.") {
  return (async () =>
    new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 })) as typeof fetch
}

describe("summarizeItem — happy path", () => {
  it("generates a summary, persists it, and reports generated: true", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
    const row = await readyItem(alice)
    const result = await summarizeItem(row, alice.orgId, alice.userId, { fetchImpl: fakeFetch("Alice's summary.") })

    assert.equal(result.generated, true)
    assert.equal(result.row.summary, "Alice's summary.")

    // Really persisted — read it back through a fresh, independent query.
    const reloaded = await repo.getItem(row.id, alice.orgId, alice.userId)
    assert.equal(reloaded?.summary, "Alice's summary.")
  })

  it("a second call for the same item returns the cached summary — generated: false, no new content", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
    const row = await readyItem(alice)
    const first = await summarizeItem(row, alice.orgId, alice.userId, { fetchImpl: fakeFetch("First summary.") })
    assert.equal(first.generated, true)

    // A DIFFERENT fake — if this were called, the assertion below
    // would fail, proving the cache hit never re-calls the AI.
    const second = await summarizeItem(first.row, alice.orgId, alice.userId, { fetchImpl: fakeFetch("Should never be seen.") })
    assert.equal(second.generated, false)
    assert.equal(second.row.summary, "First summary.")
  })
})

describe("summarizeItem — validation", () => {
  it("throws SaveValidationError when the item has no extracted text yet", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
    const row = await readyItem(alice, null)
    await assert.rejects(
      () => summarizeItem(row, alice.orgId, alice.userId, { fetchImpl: fakeFetch() }),
      SaveValidationError,
    )
  })

  it("throws SaveValidationError when the item isn't ready yet (still processing)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
    const saved = await repo.insertSavedItem({
      orgId: alice.orgId,
      userId: alice.userId,
      url: `https://example.test/${randomUUID()}`,
      normalizedUrl: null,
      domain: "example.test",
    })
    await assert.rejects(
      () => summarizeItem(saved, alice.orgId, alice.userId, { fetchImpl: fakeFetch() }),
      SaveValidationError,
    )
  })
})

describe("summarizeItem — not configured", () => {
  it("throws ServiceAiNotConfiguredError when ANTHROPIC_API_KEY is unset, and never persists a summary", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const row = await readyItem(alice)
    await assert.rejects(
      () => summarizeItem(row, alice.orgId, alice.userId, { fetchImpl: fakeFetch() }),
      ServiceAiNotConfiguredError,
    )
    const reloaded = await repo.getItem(row.id, alice.orgId, alice.userId)
    assert.equal(reloaded?.summary, null)
  })
})

describe("summarizeItem — ownership (S5)", () => {
  it("setSummary is owner-scoped — writing against another user's row affects nothing", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
    const bobsRow = await readyItem(bob)

    // Alice's (orgId, userId) do not own bob's row — repo.setSummary's
    // WHERE clause should affect zero rows, same as every other
    // owner-scoped mutation in repo.ts.
    const updated = await repo.setSummary(bobsRow.id, alice.orgId, alice.userId, "Attempted cross-tenant write.")
    assert.equal(updated, null, "no row matched alice's ownership predicate")

    const reloaded = await repo.getItem(bobsRow.id, bob.orgId, bob.userId)
    assert.equal(reloaded?.summary, null, "bob's row was never touched")
  })
})

/* ================================================================== *
 * CHARACTERIZATION — duplicate detection
 *
 * Runs against a REAL PostgreSQL, because most of what "dedup" means
 * here is not application code: it is the partial unique index
 * uq_knowledge_org_normalized created by 0004_knowledge_dedupe.sql.
 * A mocked client would assert nothing about the thing that actually
 * decides.
 *
 * Dedup is two layers, and both are characterised here:
 *
 *   1. the canonical key (lib/knowledge/url.ts) decides what "the same
 *      page" means;
 *   2. the partial unique index enforces it, and is the backstop for
 *      the race the read-then-insert in service.saveUrl cannot win.
 *
 * As in url.test.ts: these tests DESCRIBE today's behaviour. Where it
 * looks wrong the assertion still encodes the current value, marked
 * SUSPECT. No behaviour is changed in this commit.
 *
 * service.saveUrl itself is deliberately NOT exercised: it calls
 * assertSafeUrl, which performs real DNS, and a test suite that needs
 * the public internet is a test suite that fails for reasons that have
 * nothing to do with the code. Its dedup is the composition tested
 * here — canonicalise, look up, insert, catch the unique violation.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

import { canonicalizeUrlSafe, MAX_CANONICAL_URL_BYTES } from "@/lib/knowledge/url"
import * as repo from "@/lib/knowledge/repo"
import { SaveValidationError, saveUrl } from "@/lib/knowledge/service"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"

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

/** Save through the same steps service.saveUrl takes, minus the
 * network: canonicalise, then insert. */
async function save(tenant: TestTenant, url: string, userId: string | null = tenant.userId) {
  return repo.insertSavedItem({
    orgId: tenant.orgId,
    userId,
    url,
    normalizedUrl: canonicalizeUrlSafe(url),
    domain: new URL(url).hostname.replace(/^www\./, ""),
  })
}

/** A second real member of an EXISTING org. createTenant() always
 * creates a new org, which is not what "two colleagues in one
 * workspace" means — and created_by has a foreign key, so the user has
 * to genuinely exist. */
async function addMember(orgId: string, label: string): Promise<string> {
  const userId = `user_${randomBytes(8).toString("hex")}`
  const now = Date.now()
  await getTestPool().query("INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)", [
    userId,
    `${label}-${randomBytes(4).toString("hex")}@example.test`,
    "not-a-real-hash",
    now,
  ])
  await getTestPool().query(
    "INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1, $2, 'member', $3)",
    [userId, orgId, now],
  )
  return userId
}

/** The read half of service.saveUrl's read-then-insert. */
async function findExisting(tenant: TestTenant, url: string) {
  const key = canonicalizeUrlSafe(url)
  return key ? repo.findByNormalizedUrl(tenant.orgId, key) : null
}

describe("dedup — the same page saved twice", () => {
  it("finds the existing item for the exact same URL", async () => {
    const url = `https://example.com/exact-${randomBytes(6).toString("hex")}`
    const first = await save(alice, url)

    const existing = await findExisting(alice, url)
    assert.ok(existing, "a second save must find the first")
    assert.equal(existing.id, first.id)
  })

  it("finds the existing item for a URL that only differs cosmetically", async () => {
    const slug = randomBytes(6).toString("hex")
    const first = await save(alice, `https://example.com/cosmetic-${slug}`)

    for (const variant of [
      `https://www.example.com/cosmetic-${slug}`,
      `https://example.com/cosmetic-${slug}/`,
      `https://example.com/cosmetic-${slug}#intro`,
      `https://example.com/cosmetic-${slug}?utm_source=newsletter`,
      `https://EXAMPLE.com/cosmetic-${slug}?fbclid=abc`,
    ]) {
      const existing = await findExisting(alice, variant)
      assert.ok(existing, `${variant} should have matched the original`)
      assert.equal(existing.id, first.id, `${variant} resolved to the wrong item`)
    }
  })

  it("keeps genuinely different pages as separate items", async () => {
    const slug = randomBytes(6).toString("hex")
    const a = await save(alice, `https://example.com/distinct-${slug}?id=1`)
    const b = await save(alice, `https://example.com/distinct-${slug}?id=2`)

    assert.notEqual(a.id, b.id)
    assert.notEqual(a.normalized_url, b.normalized_url)
  })
})

describe("dedup — the partial unique index", () => {
  it("refuses a second ACTIVE row with the same canonical key", async () => {
    const url = `https://example.com/unique-${randomBytes(6).toString("hex")}`
    await save(alice, url)

    await assert.rejects(
      () => save(alice, url),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        assert.match(message, /duplicate key|unique/i, "service.saveUrl matches on exactly this text")
        return true
      },
      "the index is the backstop behind the read-then-insert",
    )
  })

  it("allows a second row once the first is ARCHIVED", async () => {
    // The index is WHERE archived = FALSE, so archiving releases the
    // key. Deliberate: re-saving something you archived is a new save.
    const url = `https://example.com/archived-${randomBytes(6).toString("hex")}`
    const first = await save(alice, url)
    await repo.setArchived(first.id, alice.orgId, true)

    const second = await save(alice, url)
    assert.notEqual(second.id, first.id, "archiving the first must free the key")

    // ...and findByNormalizedUrl only ever returns the active one.
    const existing = await findExisting(alice, url)
    assert.equal(existing?.id, second.id)
  })

  it("treats NULL keys as distinct, so unparseable URLs never collide", async () => {
    // WHERE normalized_url IS NOT NULL. Legacy rows and any URL the
    // canonicaliser rejects simply do not participate in dedup.
    const a = await repo.insertSavedItem({
      orgId: alice.orgId, userId: alice.userId, url: "legacy-a", normalizedUrl: null, domain: null,
    })
    const b = await repo.insertSavedItem({
      orgId: alice.orgId, userId: alice.userId, url: "legacy-b", normalizedUrl: null, domain: null,
    })
    assert.notEqual(a.id, b.id, "two NULL keys must not conflict")
  })

  it("resolves a concurrent double-save to exactly one winner", async () => {
    // The race service.saveUrl cannot win with a read: two requests
    // both find nothing, both insert, and the index decides.
    const url = `https://example.com/race-${randomBytes(6).toString("hex")}`

    const results = await Promise.allSettled([save(alice, url), save(alice, url)])
    const won = results.filter((r) => r.status === "fulfilled")
    const lost = results.filter((r) => r.status === "rejected")

    assert.equal(won.length, 1, "exactly one insert may survive")
    assert.equal(lost.length, 1)
    assert.match(
      (lost[0] as PromiseRejectedResult).reason?.message ?? "",
      /duplicate key|unique/i,
      "the loser must be recognisable, or saveUrl cannot recover it",
    )

    const rows = await getTestPool().query(
      "SELECT id FROM knowledge_items WHERE org_id = $1 AND normalized_url = $2",
      [alice.orgId, canonicalizeUrlSafe(url)],
    )
    assert.equal(rows.rows.length, 1, "the library must not contain a duplicate")
  })
})

describe("dedup — tenancy", () => {
  it("scopes the key per organization, so two orgs may save the same page", async () => {
    const url = `https://example.com/shared-${randomBytes(6).toString("hex")}`
    const mine = await save(alice, url)
    const theirs = await save(bob, url)

    assert.notEqual(mine.id, theirs.id)
    assert.equal(mine.normalized_url, theirs.normalized_url, "the same key, different tenants")
  })

  it("never resolves a lookup across organizations", async () => {
    const url = `https://example.com/private-${randomBytes(6).toString("hex")}`
    await save(alice, url)

    assert.equal(await findExisting(bob, url), null, "bob must not see alice's item")
  })
})

describe("dedup — created_by is recorded but not scoped", () => {
  it("deduplicates ACROSS users inside one organization", async () => {
    // SUSPECT (high) — this is the org-vs-user scoping decision, not a
    // canonicaliser bug, and it is characterised here so the change is
    // provable when it lands.
    //
    // Today two members of one org share a single library: the second
    // person to save a page is told it is "already in your library",
    // and it is — but it is someone else's. Under a per-user scope
    // this test must flip to expecting two rows.
    const url = `https://example.com/two-users-${randomBytes(6).toString("hex")}`
    const colleague = await addMember(alice.orgId, "colleague")

    // Same org, a different author.
    const mine = await save(alice, url, alice.userId)
    assert.equal(mine.created_by, alice.userId, "created_by IS written")

    await assert.rejects(
      () => save(alice, url, colleague),
      /duplicate key|unique/i,
      "CURRENT BEHAVIOUR: a different user cannot save a page a colleague already saved",
    )

    const found = await findExisting(alice, url)
    assert.equal(found?.created_by, alice.userId, "CURRENT BEHAVIOUR: the lookup ignores who is asking")
  })

  it("returns every member's items from a list query", async () => {
    // repo.listItems filters on org_id alone. Recorded, not judged.
    const solo = await createTenant("solo")
    const slug = randomBytes(6).toString("hex")
    const colleague = await addMember(solo.orgId, "solo-colleague")
    await save(solo, `https://example.com/by-owner-${slug}`, solo.userId)
    await save(solo, `https://example.com/by-colleague-${slug}`, colleague)

    const { rows } = await repo.listItems(solo.orgId, { limit: 50, offset: 0 })
    const authors = new Set(rows.map((r) => r.created_by))
    assert.equal(rows.length, 2)
    assert.equal(authors.size, 2, "CURRENT BEHAVIOUR: one library, two authors")
  })
})

describe("dedup — canonical key length", () => {
  it("is why the limit exists: past the ceiling the index itself refuses", async () => {
    // This is the failure MAX_CANONICAL_URL_BYTES prevents, asserted
    // against the real index so the limit stays anchored to a measured
    // fact rather than a remembered number. Reaching it now requires
    // bypassing saveUrl, as this helper does.
    //
    // The dedup index is a btree whose row maximum is 2704 bytes. Past
    // it the INSERT fails with a Postgres error that service.saveUrl
    // does not recognise (it only catches /duplicate key|unique/i), so
    // it would propagate to withApiHandler and the user would get
    // "Something went wrong. Try again." — for a URL that will never
    // succeed, however many times they retry.
    //
    // Incompressible on purpose: repeat('a', n) is TOAST-compressed to
    // almost nothing and inserts happily at 20,000 characters, which
    // makes a naive test pass and hide this entirely.
    const incompressible = randomBytes(2000).toString("hex") // 4000 chars
    const url = `https://example.com/${incompressible}`
    assert.ok(canonicalizeUrlSafe(url)!.length > 2704, "the key must exceed the btree maximum")

    await assert.rejects(
      () => save(alice, url),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        assert.match(message, /index row size|exceeds btree/i)
        assert.doesNotMatch(
          message,
          /duplicate key|unique/i,
          "and it does NOT look like a duplicate, so saveUrl's recovery path misses it",
        )
        return true
      },
    )
  })

  it("accepts a long-but-indexable canonical URL", async () => {
    const incompressible = randomBytes(1200).toString("hex") // 2400 chars
    const url = `https://example.com/${incompressible}`
    const row = await save(alice, url)
    assert.ok(row.id, "the index tolerates more than the guard allows — that gap is the headroom")
  })

  /* ── The guard, exercised through the REAL service.saveUrl ──────── *
   * saveUrl is otherwise avoided in this file because assertSafeUrl
   * does DNS. A literal public IP is the exception: the guard checks
   * it directly and returns before any lookup, so these tests exercise
   * the actual production path with no network at all. That is what
   * makes "rejected BEFORE the database" provable rather than asserted
   * about a copy of the code. */

  const publicIpUrl = (pathBytes: number) => {
    const prefix = "https://93.184.216.34/"
    return prefix + "a".repeat(pathBytes - prefix.length)
  }

  async function countItems(orgId: string): Promise<number> {
    const { rows } = await getTestPool().query<{ n: string }>(
      "SELECT count(*)::text AS n FROM knowledge_items WHERE org_id = $1",
      [orgId],
    )
    return Number(rows[0].n)
  }

  it("saveUrl rejects an over-long URL with a message the user can act on", async () => {
    const tenant = await createTenant("too-long")
    await assert.rejects(
      () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: publicIpUrl(MAX_CANONICAL_URL_BYTES + 1) }),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError, "a 400, not a 500")
        assert.match(err.message, /too long/i)
        return true
      },
    )
  })

  it("saveUrl rejects BEFORE writing anything", async () => {
    // The ordering is the point: input → canonicalise → validate →
    // dedup → persist. If the check ran after the insert the row count
    // would move, and the user would get a 500 from Postgres instead.
    const tenant = await createTenant("no-write")
    const before = await countItems(tenant.orgId)
    await assert.rejects(() =>
      saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: publicIpUrl(MAX_CANONICAL_URL_BYTES + 500) }),
    )
    assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
  })

  it("saveUrl rejects an enormous incompressible URL without reaching the index", async () => {
    // repeat("a", n) is TOAST-compressed to almost nothing and would
    // insert happily at 20,000 characters, which makes a naive test
    // pass and hides the index limit entirely. This one is genuinely
    // incompressible, and is far past the btree maximum — yet the user
    // still gets a validation error, never "index row size exceeds".
    const tenant = await createTenant("enormous")
    const url = `https://93.184.216.34/${randomBytes(4000).toString("hex")}`
    assert.ok(canonicalizeUrlSafe(url)!.length > 2704, "past the btree maximum, not merely past the guard")
    await assert.rejects(
      () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url }),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError)
        assert.doesNotMatch(err.message, /index row size|exceeds btree/i, "no raw Postgres error reaches the user")
        return true
      },
    )
    assert.equal(await countItems(tenant.orgId), 0)
  })

  it("saveUrl still accepts a URL at the limit", async () => {
    const tenant = await createTenant("at-limit")
    const result = await saveUrl({
      orgId: tenant.orgId,
      userId: tenant.userId,
      url: publicIpUrl(MAX_CANONICAL_URL_BYTES),
    })
    assert.equal(result.duplicate, false)
    assert.equal(await countItems(tenant.orgId), 1, "the limit is inclusive")
  })
})

describe("dedup — hash routes are distinct documents", () => {
  it("saves two hashbang articles as two rows", async () => {
    // The end-to-end consequence of the canonicalisation fix. Before
    // it, the second save collided with the first on the unique index
    // and the user was told the article was already in their library.
    const tenant = await createTenant("spa")
    const slug = randomBytes(6).toString("hex")
    const one = await save(tenant, `https://example.com/${slug}#!/artigo/1`)
    const two = await save(tenant, `https://example.com/${slug}#!/artigo/2`)
    assert.notEqual(one.id, two.id)
    assert.notEqual(one.normalized_url, two.normalized_url, "two keys, so the index permits both")

    const { rows } = await repo.listItems(tenant.orgId, { limit: 50, offset: 0 })
    assert.equal(rows.length, 2)
  })

  it("still collapses the SAME route saved twice", async () => {
    // The fix must not cost dedup. The index is the one that decides.
    const tenant = await createTenant("spa-dupe")
    const slug = randomBytes(6).toString("hex")
    await save(tenant, `https://example.com/${slug}#!/artigo/1`)
    await assert.rejects(
      () => save(tenant, `https://www.example.com/${slug}/#!/artigo/1`),
      (err: unknown) => {
        assert.match(err instanceof Error ? err.message : String(err), /duplicate key|unique/i)
        return true
      },
    )
  })

  it("keeps an ordinary anchor collapsing, as before", async () => {
    const tenant = await createTenant("anchor")
    const slug = randomBytes(6).toString("hex")
    await save(tenant, `https://example.com/${slug}#intro`)
    await assert.rejects(() => save(tenant, `https://example.com/${slug}#comments`))
  })
})

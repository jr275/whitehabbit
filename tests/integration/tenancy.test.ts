import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closePool, createTenant, hasDatabase, migrate, resetPocket2, testPool, type Tenant } from "../support/db"
import { deleteItem, getItem, getLibraryFacets, listItems, saveItem, updateItemState } from "@/lib/pocket2/repo/items"

/* ================================================================== *
 * MULTI-TENANCY — the tests that matter most.
 *
 * Tenant isolation is a claim about behaviour under adversarial input,
 * so it is verified against a real database with real constraints. Two
 * tenants are created, one saves an item, and the other then tries
 * every way the API allows to read, mutate, or merely CONFIRM THE
 * EXISTENCE of that item.
 * ================================================================== */

const describeDb = hasDatabase ? describe : describe.skip

describeDb("multi-tenancy: tenant A cannot reach tenant B", () => {
  let alice: Tenant
  let mallory: Tenant
  let aliceItemId: string

  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })

  beforeEach(async () => {
    await resetPocket2()
    alice = await createTenant("alice")
    mallory = await createTenant("mallory")
    const { item } = await saveItem(alice.orgId, alice.userId, "https://example.com/alices-private-research")
    aliceItemId = item.id
  })

  it("does not leak the item through a direct read", async () => {
    await expect(getItem(mallory.orgId, mallory.userId, aliceItemId)).resolves.toBeNull()
    // ...and the same call from the rightful owner does return it,
    // proving the null above is isolation and not a broken query.
    await expect(getItem(alice.orgId, alice.userId, aliceItemId)).resolves.toMatchObject({ id: aliceItemId })
  })

  it("does not leak the item through a list", async () => {
    const mine = await listItems(alice.orgId, alice.userId, {})
    const theirs = await listItems(mallory.orgId, mallory.userId, {})
    expect(mine.items.map((i) => i.id)).toContain(aliceItemId)
    expect(theirs.items).toHaveLength(0)
  })

  it("does not leak the item through search", async () => {
    const found = await listItems(mallory.orgId, mallory.userId, { search: "private research" })
    expect(found.items).toHaveLength(0)
  })

  it("does not leak the item through facet counts", async () => {
    const facets = await getLibraryFacets(mallory.orgId, mallory.userId)
    expect(facets).toMatchObject({ total: 0, unread: 0, favorites: 0, archived: 0 })
    expect(facets.topDomains).toHaveLength(0)
  })

  it("refuses a cross-tenant state write", async () => {
    const result = await updateItemState(mallory.orgId, mallory.userId, aliceItemId, { isFavorite: true })
    expect(result).toBeNull()

    // and nothing was written anywhere in the database
    const { rows } = await testPool().query(
      "SELECT count(*)::int AS n FROM saved_item_states WHERE item_id = $1 AND user_id = $2",
      [aliceItemId, mallory.userId],
    )
    expect(rows[0].n).toBe(0)
  })

  it("refuses a cross-tenant delete, and the item survives", async () => {
    await expect(deleteItem(mallory.orgId, aliceItemId)).resolves.toBe(false)
    await expect(getItem(alice.orgId, alice.userId, aliceItemId)).resolves.not.toBeNull()
  })

  it("reports 'not yours' and 'does not exist' identically, so a probe learns nothing", async () => {
    const crossTenant = await getItem(mallory.orgId, mallory.userId, aliceItemId)
    const nonexistent = await getItem(mallory.orgId, mallory.userId, "item_does_not_exist")
    expect(crossTenant).toBe(nonexistent) // both null — indistinguishable
    expect(await deleteItem(mallory.orgId, aliceItemId)).toBe(await deleteItem(mallory.orgId, "item_nope"))
  })

  it("is enforced by the database itself, not only by query predicates", async () => {
    // Bypass the repository entirely and attempt the write directly, as
    // a SQL-injection or a future missing predicate would. The composite
    // foreign key must still refuse it.
    await expect(
      testPool().query(
        `INSERT INTO saved_item_states (item_id, user_id, org_id, created_at, updated_at)
         VALUES ($1, $2, $3, 1, 1)`,
        [aliceItemId, mallory.userId, mallory.orgId],
      ),
    ).rejects.toThrow(/foreign key constraint/i)
  })
})

describeDb("idempotent save", () => {
  let alice: Tenant
  let bob: Tenant

  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })
  beforeEach(async () => {
    await resetPocket2()
    alice = await createTenant("alice")
    bob = await createTenant("bob")
  })

  it("returns the existing item instead of creating a duplicate", async () => {
    const first = await saveItem(alice.orgId, alice.userId, "https://example.com/post")
    const second = await saveItem(alice.orgId, alice.userId, "https://www.example.com/post/?utm_source=twitter")

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.item.id).toBe(first.item.id)

    const page = await listItems(alice.orgId, alice.userId, {})
    expect(page.items).toHaveLength(1)
  })

  it("survives a genuine race — concurrent saves create exactly one item", async () => {
    // Two devices saving the same link at the same moment. A
    // read-then-write duplicate check would let both through; the
    // unique index does not.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => saveItem(alice.orgId, alice.userId, "https://example.com/race")),
    )
    const ids = new Set(results.map((r) => r.item.id))
    expect(ids.size).toBe(1)
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1)
  })

  it("does not deduplicate ACROSS tenants — each library is its own", async () => {
    const a = await saveItem(alice.orgId, alice.userId, "https://example.com/shared")
    const b = await saveItem(bob.orgId, bob.userId, "https://example.com/shared")
    expect(b.duplicate).toBe(false)
    expect(b.item.id).not.toBe(a.item.id)
  })

  it("enqueues exactly one ingestion job for a new item and none for a duplicate", async () => {
    const { item } = await saveItem(alice.orgId, alice.userId, "https://example.com/jobs")
    await saveItem(alice.orgId, alice.userId, "https://example.com/jobs")
    const { rows } = await testPool().query(
      "SELECT count(*)::int AS n FROM ingest_jobs WHERE item_id = $1", [item.id],
    )
    expect(rows[0].n).toBe(1)
  })

  it("never claims content it has not fetched", async () => {
    const { item } = await saveItem(alice.orgId, alice.userId, "https://example.com/some-article-slug")
    expect(item.ingestStatus).toBe("pending")
    expect(item.readerStatus).toBe("not_available")
    expect(item.description).toBeNull()
    expect(item.wordCount).toBeNull()
    // the placeholder title is visibly derived from the URL
    expect(item.title).toBe("Some article slug")
  })
})

/* ================================================================== *
 * BATCHED TAG READS — same answer, same scope, one round-trip.
 *
 * The risk in replacing N queries with one is not that it is slower;
 * it is that the batched predicate quietly differs from the
 * per-item one and returns a tag the caller should not see. So these
 * tests do not assert the new function in isolation — they assert it
 * agrees with getTags, item by item, including for items in another
 * tenant's library where the right answer is "nothing".
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"

async function saveWithTags(t: TestTenant, tags: string[]): Promise<string> {
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  const pool = getTestPool()
  await pool.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,'A piece','Ex','ex.test',$5,$6,$6)`,
    [id, t.orgId, t.userId, `https://ex.test/${id}`, "Body text.", now],
  )
  for (const tag of tags) {
    await pool.query(
      `INSERT INTO knowledge_item_tags (item_id, org_id, tag) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [id, t.orgId, tag],
    )
  }
  return id
}

describe("getTagsForItems", () => {
  let alice: TestTenant
  let bob: TestTenant
  let tagged: string
  let untagged: string
  let bobItem: string

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("tags-a")
    bob = await createTenant("tags-b")
    tagged = await saveWithTags(alice, ["retrieval", "chunking", "alpha"])
    untagged = await saveWithTags(alice, [])
    bobItem = await saveWithTags(bob, ["secret-tag"])
  })
  after(closeTestPool)

  it("agrees with getTags for every item, one by one", async () => {
    // The property that makes the substitution safe.
    const ids = [tagged, untagged]
    const batched = await repo.getTagsForItems(ids, alice.orgId, alice.userId)
    for (const id of ids) {
      assert.deepEqual(batched.get(id), await repo.getTags(id, alice.orgId, alice.userId), `mismatch for ${id}`)
    }
  })

  it("returns tags sorted, as the single-item version does", async () => {
    const batched = await repo.getTagsForItems([tagged], alice.orgId, alice.userId)
    assert.deepEqual(batched.get(tagged), ["alpha", "chunking", "retrieval"])
  })

  it("gives an untagged item an empty array, not a missing key", async () => {
    // A caller that had to distinguish "no tags" from "not in the
    // map" would eventually get it wrong.
    const batched = await repo.getTagsForItems([untagged], alice.orgId, alice.userId)
    assert.ok(batched.has(untagged))
    assert.deepEqual(batched.get(untagged), [])
  })

  it("returns an entry for an id that does not exist at all", async () => {
    const batched = await repo.getTagsForItems(["kn_does_not_exist"], alice.orgId, alice.userId)
    assert.deepEqual(batched.get("kn_does_not_exist"), [])
  })

  it("returns nothing for another tenant's item, even when asked for it directly", async () => {
    // The whole reason this test file exists: batching must not
    // widen what a caller can see.
    const batched = await repo.getTagsForItems([bobItem], alice.orgId, alice.userId)
    assert.deepEqual(batched.get(bobItem), [])
    assert.deepEqual(await repo.getTags(bobItem, alice.orgId, alice.userId), [], "single-item read must agree")
  })

  it("does not leak a tenant's tags when their ids are mixed into a legitimate batch", async () => {
    const batched = await repo.getTagsForItems([tagged, bobItem], alice.orgId, alice.userId)
    assert.deepEqual(batched.get(tagged), ["alpha", "chunking", "retrieval"])
    assert.deepEqual(batched.get(bobItem), [])
  })

  it("produces exactly what the per-row version produced, in order", async () => {
    // What the two routes actually swapped: `rows.map(row =>
    // rowToItem(row, await getTags(row.id)))` became `rows.map(row =>
    // rowToItem(row, tags.get(row.id) ?? []))`. This pins that the
    // substitution changes neither the contents nor the order, which
    // is the whole behavioural claim of the N+1 fix.
    const rows = [{ id: tagged }, { id: untagged }, { id: tagged }]

    const perRow = await Promise.all(rows.map(async (r) => repo.getTags(r.id, alice.orgId, alice.userId)))
    const map = await repo.getTagsForItems(rows.map((r) => r.id), alice.orgId, alice.userId)
    const batched = rows.map((r) => map.get(r.id) ?? [])

    assert.deepEqual(batched, perRow)
    assert.equal(batched.length, rows.length, "a repeated id must still yield one entry per row")
  })

  it("handles an empty id list without a query", async () => {
    assert.equal((await repo.getTagsForItems([], alice.orgId, alice.userId)).size, 0)
  })
})

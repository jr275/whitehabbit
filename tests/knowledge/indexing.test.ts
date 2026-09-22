/* ================================================================== *
 * INDEXING — against a real PostgreSQL, because the claims are SQL.
 *
 * The things worth testing here are not branches in TypeScript, they
 * are database behaviours: does the owner filter actually keep one
 * user's chunks away from another; does a second concurrent indexer
 * collide with the first or wait for it; does changing a document's
 * text really remove the passages that no longer exist. A mocked
 * client would let every one of those pass while broken.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { chunkId, contentHash, indexItem } from "@/lib/knowledge/indexing"
import * as repo from "@/lib/knowledge/repo"

/** Long enough to produce several chunks (target is 3,600 chars). */
const LONG = Array.from(
  { length: 60 },
  (_, i) => `Paragraph ${i} explores one idea at enough length that it survives chunking as a real passage rather than a fragment.`,
).join("\n\n")

const SHORT = "One short saved note about retrieval."

async function makeItem(t: TestTenant, contentText: string | null): Promise<string> {
  const p = getTestPool()
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await p.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,$6,$6)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, contentText, now],
  )
  return id
}

const countChunks = async (itemId: string): Promise<number> => {
  const { rows } = await getTestPool().query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM knowledge_chunks WHERE item_id = $1",
    [itemId],
  )
  return Number(rows[0].n)
}

describe("indexing an item", () => {
  let alice: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("alice")
  })
  after(closeTestPool)

  it("chunks content on the first pass and stamps the hash", async () => {
    const itemId = await makeItem(alice, LONG)
    const result = await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })

    assert.equal(result.status, "indexed")
    assert.ok(result.status === "indexed" && result.chunks > 1, "long content should produce several chunks")
    assert.equal(await countChunks(itemId), result.status === "indexed" ? result.chunks : -1)

    const item = await repo.getItem(itemId, alice.orgId, alice.userId)
    assert.equal(item?.content_hash, contentHash(LONG), "the item must carry the hash of what was chunked")
  })

  it("stores offsets that slice back to the exact chunk text", async () => {
    // The whole citation model rests on this holding after a round
    // trip through Postgres, not just in memory.
    const itemId = await makeItem(alice, LONG)
    await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })

    const chunks = await repo.getChunks(itemId, alice.orgId, alice.userId)
    assert.ok(chunks.length > 1)
    chunks.forEach((c, i) => {
      assert.equal(c.ordinal, i, "chunks must come back in reading order")
      assert.equal(LONG.slice(c.char_start!, c.char_end!), c.text, `chunk ${i} offsets must survive the database`)
      assert.equal(c.org_id, alice.orgId, "ownership must be mirrored onto the chunk")
      assert.equal(c.created_by, alice.userId)
    })
  })

  it("is idempotent: re-indexing unchanged content writes nothing", async () => {
    const itemId = await makeItem(alice, LONG)
    const first = await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })
    assert.equal(first.status, "indexed")

    const before = await repo.getChunks(itemId, alice.orgId, alice.userId)
    const second = await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })
    assert.equal(second.status, "unchanged", "an unchanged document must short-circuit")

    const afterRows = await repo.getChunks(itemId, alice.orgId, alice.userId)
    assert.deepEqual(
      afterRows.map((c) => [c.id, c.ordinal, c.text, c.created_at]),
      before.map((c) => [c.id, c.ordinal, c.text, c.created_at]),
      "rows must not be rewritten — created_at proves they were left alone",
    )
  })

  it("replaces stale chunks when the content changes, leaving none behind", async () => {
    const itemId = await makeItem(alice, LONG)
    const first = await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })
    assert.ok(first.status === "indexed" && first.chunks > 1)

    // Shorter text means FEWER chunks — the case where an upsert
    // without a delete would strand high-ordinal rows that still
    // answer searches with text the document no longer contains.
    await getTestPool().query("UPDATE knowledge_items SET content_text = $1 WHERE id = $2", [SHORT, itemId])
    const second = await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })

    assert.equal(second.status, "indexed")
    assert.equal(second.status === "indexed" ? second.chunks : -1, 1)
    assert.equal(await countChunks(itemId), 1, "no stale chunk may survive")

    const chunks = await repo.getChunks(itemId, alice.orgId, alice.userId)
    assert.equal(chunks[0].text, SHORT)
    const item = await repo.getItem(itemId, alice.orgId, alice.userId)
    assert.equal(item?.content_hash, contentHash(SHORT), "the hash must track the new content")
  })

  it("rebuilds when the hash is stamped but the chunks are gone", async () => {
    // A run that died between writing chunks and stamping the hash —
    // or rows removed underneath us. The document must not stay
    // permanently unretrievable just because the hash matches.
    const itemId = await makeItem(alice, LONG)
    await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })
    await getTestPool().query("DELETE FROM knowledge_chunks WHERE item_id = $1", [itemId])

    const result = await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })
    assert.equal(result.status, "indexed", "a stamped hash with no chunks must rebuild, not short-circuit")
    assert.ok(await countChunks(itemId) > 1)
  })
})

describe("content the pipeline cannot index", () => {
  let alice: TestTenant
  before(async () => {
    await prepareDatabase()
    alice = await createTenant("nocontent")
  })
  after(closeTestPool)

  it("reports no_content for a NULL body, and writes nothing", async () => {
    const itemId = await makeItem(alice, null)
    assert.equal((await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })).status, "no_content")
    assert.equal(await countChunks(itemId), 0)
    const item = await repo.getItem(itemId, alice.orgId, alice.userId)
    assert.equal(item?.content_hash, null, "an unindexable item must not be stamped as indexed")
  })

  it("reports no_content for whitespace-only text", async () => {
    const itemId = await makeItem(alice, "   \n\n \t  \n")
    assert.equal((await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })).status, "no_content")
    assert.equal(await countChunks(itemId), 0)
  })

  it("reports not_found for an item that does not exist", async () => {
    const result = await indexItem({ itemId: "kn_missing", orgId: alice.orgId, userId: alice.userId })
    assert.equal(result.status, "not_found")
  })
})

describe("ownership is enforced by the database, not by a caller's care", () => {
  let alice: TestTenant
  let bob: TestTenant
  let carol: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("owner")
    bob = await createTenant("otherorg")
    // Same organization as alice, different person — the case a
    // naive org-only filter gets wrong.
    carol = { orgId: alice.orgId, userId: (await createTenant("sameorg")).userId }
    await getTestPool().query("INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1,$2,'member',$3)", [
      carol.userId, alice.orgId, Date.now(),
    ])
  })
  after(closeTestPool)

  it("another organization cannot index someone's item", async () => {
    const itemId = await makeItem(alice, LONG)
    const result = await indexItem({ itemId, orgId: bob.orgId, userId: bob.userId })
    assert.equal(result.status, "not_found", "cross-org must be indistinguishable from missing")
    assert.equal(await countChunks(itemId), 0, "nothing may be written under another org")
  })

  it("another user in the SAME organization cannot index it either", async () => {
    const itemId = await makeItem(alice, LONG)
    const result = await indexItem({ itemId, orgId: carol.orgId, userId: carol.userId })
    assert.equal(result.status, "not_found")
    assert.equal(await countChunks(itemId), 0)
  })

  it("chunks are never readable by another user or organization", async () => {
    const itemId = await makeItem(alice, LONG)
    await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })
    assert.ok((await repo.getChunks(itemId, alice.orgId, alice.userId)).length > 0)
    assert.equal((await repo.getChunks(itemId, bob.orgId, bob.userId)).length, 0, "cross-org read leaked")
    assert.equal((await repo.getChunks(itemId, carol.orgId, carol.userId)).length, 0, "cross-user read leaked")
  })

  it("deleting the item removes its chunks", async () => {
    const itemId = await makeItem(alice, LONG)
    await indexItem({ itemId, orgId: alice.orgId, userId: alice.userId })
    assert.ok(await countChunks(itemId) > 0)
    await getTestPool().query("DELETE FROM knowledge_items WHERE id = $1", [itemId])
    assert.equal(await countChunks(itemId), 0)
  })
})

describe("concurrency", () => {
  let alice: TestTenant
  before(async () => {
    await prepareDatabase()
    alice = await createTenant("race")
  })
  after(closeTestPool)

  it("two indexers racing on one item produce one clean set of chunks", async () => {
    // Without the row lock in replaceChunks, both would DELETE and
    // both would INSERT, and the loser would violate
    // uq_knowledge_chunks_item_ordinal.
    const itemId = await makeItem(alice, LONG)
    const results = await Promise.all([
      indexItem({ itemId, orgId: alice.orgId, userId: alice.userId }),
      indexItem({ itemId, orgId: alice.orgId, userId: alice.userId }),
      indexItem({ itemId, orgId: alice.orgId, userId: alice.userId }),
    ])

    for (const r of results) {
      assert.ok(r.status === "indexed" || r.status === "unchanged", `unexpected ${r.status} under concurrency`)
    }
    const chunks = await repo.getChunks(itemId, alice.orgId, alice.userId)
    assert.ok(chunks.length > 1)
    assert.deepEqual(chunks.map((c) => c.ordinal), chunks.map((_, i) => i), "ordinals must be a clean 0..n-1 run")
    assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length, "no duplicate chunk ids")
  })
})

describe("derived identity", () => {
  it("chunk ids are deterministic, not random", () => {
    const a = chunkId("kn_1", 0, contentHash("passage"))
    assert.equal(a, chunkId("kn_1", 0, contentHash("passage")))
    assert.notEqual(a, chunkId("kn_1", 1, contentHash("passage")), "position must be part of identity")
    assert.notEqual(a, chunkId("kn_2", 0, contentHash("passage")), "the item must be part of identity")
    assert.notEqual(a, chunkId("kn_1", 0, contentHash("other")), "the text must be part of identity")
  })

  it("the content hash is sha256 of the text, not of the HTML", () => {
    assert.match(contentHash("x"), /^[0-9a-f]{64}$/)
    assert.equal(contentHash("x"), contentHash("x"))
    assert.notEqual(contentHash("x"), contentHash("y"))
  })
})

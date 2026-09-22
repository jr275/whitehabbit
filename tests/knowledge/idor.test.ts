/* ================================================================== *
 * IDOR — the authorization rule, stated as tests.
 *
 * tests/knowledge/scope-parity.test.ts already proves that the two
 * READ paths (Library search and Knowledge AI retrieval) refuse to
 * return another tenant's rows. This file covers the other half, which
 * nothing exercised: the MUTATIONS.
 *
 * That gap mattered more than it looks. A leak in a read path shows
 * another person's content, which is bad and visible. A missing
 * predicate in a WRITE path lets someone archive, favourite, rename,
 * re-status or DELETE a row they cannot even see — damage to a library
 * whose owner has no way to attribute it, and no test anywhere would
 * have noticed, because every mutation test until now used one tenant
 * for both the setup and the assertion.
 *
 * The rule every case below encodes is:
 *
 *     requester ∈ (org, owner) of the resource
 *
 * and specifically NOT "the row exists, so act on it". Each test names
 * the row by its REAL id — the same id its owner uses — because that
 * is exactly what an attacker who has seen an id once possesses. The
 * ids are UUID-based and unguessable, but unguessability is not
 * authorization, and none of these assertions depend on it.
 *
 * Two attackers are used throughout, because they fail differently:
 *   - a DIFFERENT ORGANIZATION (classic cross-tenant), and
 *   - a DIFFERENT USER INSIDE THE SAME ORGANIZATION, which is the one
 *     an org_id-only predicate would silently allow.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"

let owner: TestTenant
/** A whole separate organization. */
let otherOrg: TestTenant
/** A second user inside the OWNER's organization. */
let sameOrgOther: TestTenant

before(async () => {
  await prepareDatabase()
  owner = await createTenant("idor-owner")
  otherOrg = await createTenant("idor-otherorg")

  // A colleague: same org row, different user row and membership.
  const colleague = await createTenant("idor-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, colleague.userId])
  sameOrgOther = { orgId: owner.orgId, userId: colleague.userId }
})
after(async () => {
  await closeTestPool()
})

let seq = 0
async function ownedItem() {
  seq += 1
  return repo.insertSavedItem({
    orgId: owner.orgId,
    userId: owner.userId,
    url: `https://example.test/private-${seq}`,
    normalizedUrl: `example.test/private-${seq}`,
    domain: "example.test",
  })
}

/** Every scope that must NOT be able to touch the owner's row. */
function attackers(): { label: string; scope: TestTenant }[] {
  return [
    { label: "another organization", scope: otherOrg },
    { label: "another user in the same organization", scope: sameOrgOther },
  ]
}

/* ================================================================== *
 * READ
 * ================================================================== */

describe("reading someone else's item", () => {
  it("the owner can read their own item", async () => {
    const item = await ownedItem()
    const read = await repo.getItem(item.id, owner.orgId, owner.userId)
    assert.equal(read?.id, item.id)
  })

  it("nobody else can, even holding the real id", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      assert.equal(await repo.getItem(item.id, scope.orgId, scope.userId), null, `leaked to ${label}`)
    }
  })

  it("a mismatched org/user PAIR is refused even when each half is real", async () => {
    // The subtle case: an attacker's own user id combined with the
    // victim's org id (or the reverse), which is what a tampered
    // session claim looks like after requireSession's membership check
    // has been passed by some other route. Neither half alone is
    // enough; the row belongs to the pair.
    const item = await ownedItem()
    assert.equal(await repo.getItem(item.id, owner.orgId, otherOrg.userId), null)
    assert.equal(await repo.getItem(item.id, otherOrg.orgId, owner.userId), null)
  })

  it("does not appear in anyone else's list", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      const { rows, total } = await repo.listItems(scope.orgId, scope.userId, { limit: 100, offset: 0 })
      assert.ok(!rows.some((r) => r.id === item.id), `listed for ${label}`)
      assert.equal(total, 0, `${label} sees a non-zero total`)
    }
  })

  it("does not appear in anyone else's search results", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      const found = await repo.searchItems(scope.orgId, scope.userId, "private", 20)
      assert.ok(!found.some((r) => r.id === item.id), `searchable by ${label}`)
    }
  })

  it("its tags are not readable either", async () => {
    // Tags carry content — a tag list is a summary of what someone
    // saved. Scoping the item but not its tags would leak that.
    const item = await ownedItem()
    await getTestPool().query("INSERT INTO knowledge_item_tags (item_id, org_id, tag) VALUES ($1, $2, $3)", [
      item.id,
      owner.orgId,
      "confidential-topic",
    ])

    assert.deepEqual(await repo.getTags(item.id, owner.orgId, owner.userId), ["confidential-topic"])
    for (const { label, scope } of attackers()) {
      assert.deepEqual(await repo.getTags(item.id, scope.orgId, scope.userId), [], `tags leaked to ${label}`)
      // The batched path seeds the map with every id it was asked
      // about, so the security property is that the LIST is empty —
      // not that the key is missing.
      const batch = await repo.getTagsForItems([item.id], scope.orgId, scope.userId)
      assert.deepEqual(batch.get(item.id) ?? [], [], `batched tags leaked to ${label}`)
    }
  })
})

/* ================================================================== *
 * MUTATION — the half nothing covered
 * ================================================================== */

describe("mutating someone else's item", () => {
  it("favourite: refused, and the stored value is unchanged", async () => {
    const item = await ownedItem()
    assert.equal(item.favorite, false)

    for (const { label, scope } of attackers()) {
      assert.equal(await repo.setFavorite(item.id, scope.orgId, scope.userId, true), null, `${label} got a row back`)
      const actual = await repo.getItem(item.id, owner.orgId, owner.userId)
      assert.equal(actual?.favorite, false, `${label} changed the stored value`)
    }

    // ...and the owner still can.
    assert.equal((await repo.setFavorite(item.id, owner.orgId, owner.userId, true))?.favorite, true)
  })

  it("archive: refused, and the stored value is unchanged", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      assert.equal(await repo.setArchived(item.id, scope.orgId, scope.userId, true), null, `${label} got a row back`)
      assert.equal((await repo.getItem(item.id, owner.orgId, owner.userId))?.archived, false, `${label} archived it`)
    }
    assert.equal((await repo.setArchived(item.id, owner.orgId, owner.userId, true))?.archived, true)
  })

  it("delete: refused, and the row survives", async () => {
    // The most damaging one, and the one where a silent no-op is
    // indistinguishable from success unless something checks the row.
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      assert.equal(await repo.deleteItem(item.id, scope.orgId, scope.userId), false, `${label} reported a delete`)
      assert.ok(await repo.getItem(item.id, owner.orgId, owner.userId), `${label} actually deleted it`)
    }
    assert.equal(await repo.deleteItem(item.id, owner.orgId, owner.userId), true)
    assert.equal(await repo.getItem(item.id, owner.orgId, owner.userId), null)
  })

  it("mark-read: refused, and read_at stays null", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      await repo.markRead(item.id, scope.orgId, scope.userId)
      assert.equal((await repo.getItem(item.id, owner.orgId, owner.userId))?.read_at, null, `${label} marked it read`)
    }
    await repo.markRead(item.id, owner.orgId, owner.userId)
    assert.ok((await repo.getItem(item.id, owner.orgId, owner.userId))?.read_at)
  })

  it("status: refused — nobody else can push an item into failed", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      await repo.setStatus(item.id, scope.orgId, scope.userId, "failed", "injected by an attacker")
      const actual = await repo.getItem(item.id, owner.orgId, owner.userId)
      assert.equal(actual?.status, "saved", `${label} changed the status`)
      assert.equal(actual?.error, null, `${label} wrote an error message onto the row`)
    }
  })

  it("summary: refused — nobody else can overwrite the stored text", async () => {
    const item = await ownedItem()
    await repo.setSummary(item.id, owner.orgId, owner.userId, "the owner's summary")

    for (const { label, scope } of attackers()) {
      assert.equal(await repo.setSummary(item.id, scope.orgId, scope.userId, "overwritten"), null, `${label} got a row back`)
      assert.equal(
        (await repo.getItem(item.id, owner.orgId, owner.userId))?.summary,
        "the owner's summary",
        `${label} overwrote the summary`,
      )
    }
  })

  it("attempts: refused — nobody else can burn another library's retry budget", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      await repo.incrementAttempts(item.id, scope.orgId, scope.userId)
      assert.equal((await repo.getItem(item.id, owner.orgId, owner.userId))?.attempts, 0, `${label} incremented attempts`)
    }
  })
})

/* ================================================================== *
 * DERIVED RESOURCES — chunks and jobs carry the same content
 * ================================================================== */

describe("derived resources inherit the same scope", () => {
  it("chunks are not readable by anyone else", async () => {
    // Chunks are the article body, split up. Scoping the item but not
    // its chunks would leak the whole text through the back door.
    const item = await ownedItem()
    await repo.replaceChunks(item.id, owner.orgId, owner.userId, "hash-of-the-body", [
      {
        id: `chunk_${item.id}_0`,
        ordinal: 0,
        text: "a private sentence from the body",
        charStart: 0,
        charEnd: 32,
        tokenEstimate: 8,
        contentHash: "hash-of-the-body",
      },
    ])

    assert.equal((await repo.getChunks(item.id, owner.orgId, owner.userId)).length, 1)
    for (const { label, scope } of attackers()) {
      assert.deepEqual(await repo.getChunks(item.id, scope.orgId, scope.userId), [], `chunks leaked to ${label}`)
    }
  })

  it("a job enqueued by someone else does not attach to this item", async () => {
    const item = await ownedItem()
    for (const { label, scope } of attackers()) {
      const job = await repo.enqueueIngestJob(item.id, scope.orgId, scope.userId).catch(() => null)
      if (job) {
        // If a row was written at all it must never have been credited
        // to the victim's tenancy — that is what the worker later reads
        // to decide whose library it is touching.
        assert.notEqual(job.org_id, owner.orgId, `${label} enqueued a job under the owner's org`)
      }
    }
  })
})

/* ================================================================== *
 * THE NULL-OWNER EDGE
 * ================================================================== */

describe("the null-owner edge", () => {
  it("a row with no owner is invisible to every real session", async () => {
    // The predicate is `created_by IS NOT DISTINCT FROM $n`, which
    // makes NULL match NULL. requireSession() never yields a null user
    // id, so such a row (a legacy import, a manual insert) is reachable
    // by nobody — fail-closed. The risk being pinned here is the
    // opposite reading: that NULL might mean "unowned, therefore
    // everyone's".
    const orphan = await repo.insertSavedItem({
      orgId: owner.orgId,
      userId: null,
      url: "https://example.test/ownerless",
      normalizedUrl: "example.test/ownerless",
      domain: "example.test",
    })

    assert.equal(await repo.getItem(orphan.id, owner.orgId, owner.userId), null, "visible to the org's owner")
    for (const { label, scope } of attackers()) {
      assert.equal(await repo.getItem(orphan.id, scope.orgId, scope.userId), null, `visible to ${label}`)
    }
    // Only an explicitly null-owner scope resolves it, which no session produces.
    assert.equal((await repo.getItem(orphan.id, owner.orgId, null))?.id, orphan.id)
  })
})

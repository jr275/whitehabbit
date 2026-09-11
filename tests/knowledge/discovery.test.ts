/* ================================================================== *
 * DISCOVERY — the Reader's "Key ideas / Related knowledge" panel, end
 * to end from real rows.
 *
 * findRelatedItems and explainRelation already have their own tests in
 * concepts.test.ts; this file is about the layer between them and the
 * screen, and it pins three things that would otherwise fail silently:
 *
 *  1. THE EMPTY CASES STAY DISTINGUISHABLE. "not analyzed yet" and
 *     "analyzed, nothing related" render as completely different
 *     sentences. Collapsing them makes a working feature look broken,
 *     and the collapse is a one-character change.
 *  2. NOTHING IS RE-RANKED ON THE WAY OUT. Ordering is related.ts's
 *     job and is tested there. A second sort here would be a ranking
 *     rule invisible to those tests.
 *  3. THE REASON MATCHES THE DATA. `why` must be assembled from the
 *     shared concepts it ships beside, so a viewer can check it.
 *
 * Real PostgreSQL. No model is called; no credential is needed.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { closeTestPool, createTenant, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"
import { replaceItemConcepts } from "@/lib/knowledge/concepts/repo"
import { findRelatedItems } from "@/lib/knowledge/concepts/related"
import { discoverForItem, RELATED_LIMIT } from "@/lib/knowledge/concepts/discovery"
import { emptyDiscovery } from "@/lib/knowledge/discovery-contract"
import { canonicalConceptName, normalizeConceptName } from "@/lib/knowledge/concepts/normalize"

let owner: TestTenant
let sameOrgOther: TestTenant

before(async () => {
  await prepareDatabase()
  owner = await createTenant("disc-owner")
  sameOrgOther = await createTenant("disc-other")
})
after(async () => {
  await closeTestPool()
})

function scopeOf(t: TestTenant) {
  return { orgId: t.orgId, userId: t.userId }
}

let seq = 0
async function itemFor(t: TestTenant, slug: string) {
  seq += 1
  return repo.insertSavedItem({
    orgId: t.orgId,
    userId: t.userId,
    url: `https://example.test/${slug}-${seq}`,
    normalizedUrl: `example.test/${slug}-${seq}`,
    domain: "example.test",
  })
}

function extracted(name: string, confidence = 0.9, chunkIds = ["chunk_1"]) {
  return {
    name,
    canonicalName: canonicalConceptName(name),
    normalizedName: normalizeConceptName(name),
    type: "TOPIC" as const,
    confidence,
    evidence: chunkIds.map((chunkId) => ({ chunkId })),
    source: "llm" as const,
  }
}

/* ================================================================== *
 * THE THREE EMPTIES
 * ================================================================== */

describe("discovery — the empty cases are not the same empty", () => {
  it("reports not_analyzed for an item with no concepts", async () => {
    const item = await itemFor(owner, "unread")
    const result = await discoverForItem(item.id, scopeOf(owner))

    assert.equal(result.status, "not_analyzed")
    assert.deepEqual(result.concepts, [])
    assert.deepEqual(result.related, [])
  })

  it("still reports not_analyzed when OTHER items in the library are analyzed", async () => {
    // The distinction that matters: relatedness is defined by shared
    // concepts, so an item with none has no relationships to find —
    // however rich the rest of the library is. Reporting "ready, none
    // related" here would tell the reader their library has nothing to
    // do with this piece, which is not what we know.
    const analyzed = await itemFor(owner, "analyzed-neighbour")
    await replaceItemConcepts(analyzed.id, [extracted("Retrieval")], scopeOf(owner))

    const bare = await itemFor(owner, "bare")
    const result = await discoverForItem(bare.id, scopeOf(owner))

    assert.equal(result.status, "not_analyzed")
    assert.deepEqual(result.related, [])
  })

  it("reports ready with an empty related list when the concepts are unshared", async () => {
    const lonely = await itemFor(owner, "lonely")
    await replaceItemConcepts(lonely.id, [extracted("Entirely Its Own Subject")], scopeOf(owner))

    const result = await discoverForItem(lonely.id, scopeOf(owner))
    assert.equal(result.status, "ready", "the item HAS been read — that is a different fact from nothing related")
    assert.equal(result.concepts.length, 1)
    assert.deepEqual(result.related, [])
  })

  it("emptyDiscovery carries the status through rather than flattening it", () => {
    for (const status of ["ready", "not_analyzed", "unavailable"] as const) {
      const e = emptyDiscovery("kn_x", status)
      assert.equal(e.status, status)
      assert.deepEqual(e.concepts, [])
      assert.deepEqual(e.related, [])
    }
  })
})

/* ================================================================== *
 * THE HAPPY PATH
 * ================================================================== */

describe("discovery — what the panel actually shows", () => {
  it("returns the item's own concepts with the evidence count behind each", async () => {
    const item = await itemFor(owner, "subject")
    await replaceItemConcepts(
      item.id,
      [extracted("Tool Calling", 0.93, ["chunk_1", "chunk_2"]), extracted("Agent Memory", 0.8)],
      scopeOf(owner),
    )

    const result = await discoverForItem(item.id, scopeOf(owner))
    assert.equal(result.status, "ready")
    assert.deepEqual(result.concepts.map((c) => c.label), ["Tool Calling", "Agent Memory"])
    assert.equal(result.concepts[0].evidenceCount, 2, "the count must be the passages actually cited")
    assert.equal(result.concepts[1].evidenceCount, 1)
    assert.equal(result.concepts[0].type, "TOPIC")
  })

  it("explains each relationship with the concepts it shipped beside it", async () => {
    const a = await itemFor(owner, "why-a")
    const b = await itemFor(owner, "why-b")
    await replaceItemConcepts(a.id, [extracted("Vector Search"), extracted("Reranking")], scopeOf(owner))
    await replaceItemConcepts(b.id, [extracted("Vector Search"), extracted("Reranking")], scopeOf(owner))

    const result = await discoverForItem(a.id, scopeOf(owner))
    const hit = result.related.find((r) => r.id === b.id)
    assert.ok(hit, "an item sharing two concepts must be related")

    // The check a viewer can make themselves: every name in the
    // sentence is one of the chips next to it.
    for (const s of hit!.shared) assert.ok(hit!.why.includes(s.label), `"${hit!.why}" omits ${s.label}`)
    assert.match(hit!.why, /^Both discuss /)
  })

  it("preserves related.ts's order instead of re-ranking", async () => {
    const subject = await itemFor(owner, "order-subject")
    await replaceItemConcepts(subject.id, [extracted("Alpha"), extracted("Beta")], scopeOf(owner))
    const weak = await itemFor(owner, "order-weak")
    await replaceItemConcepts(weak.id, [extracted("Alpha", 0.4)], scopeOf(owner))
    const strong = await itemFor(owner, "order-strong")
    await replaceItemConcepts(strong.id, [extracted("Alpha"), extracted("Beta")], scopeOf(owner))

    const engine = await findRelatedItems(subject.id, scopeOf(owner), RELATED_LIMIT)
    const result = await discoverForItem(subject.id, scopeOf(owner))

    assert.deepEqual(
      result.related.map((r) => r.id),
      engine.map((r) => r.itemId),
      "discovery must ship the ranking module's order, not one of its own",
    )
    assert.deepEqual(
      result.related.map((r) => r.score),
      engine.map((r) => r.score),
    )
  })

  it("honours the limit it is given", async () => {
    const subject = await itemFor(owner, "limit-subject")
    await replaceItemConcepts(subject.id, [extracted("Crowded")], scopeOf(owner))
    for (let i = 0; i < 4; i += 1) {
      const neighbour = await itemFor(owner, `limit-n${i}`)
      await replaceItemConcepts(neighbour.id, [extracted("Crowded")], scopeOf(owner))
    }

    const result = await discoverForItem(subject.id, scopeOf(owner), 2)
    assert.equal(result.related.length, 2)
  })

  it("carries the url and title a link needs, and tolerates a missing title", async () => {
    const a = await itemFor(owner, "link-a")
    const b = await itemFor(owner, "link-b")
    await replaceItemConcepts(a.id, [extracted("Linkable")], scopeOf(owner))
    await replaceItemConcepts(b.id, [extracted("Linkable")], scopeOf(owner))

    const hit = (await discoverForItem(a.id, scopeOf(owner))).related.find((r) => r.id === b.id)
    assert.ok(hit)
    assert.equal(hit!.url, b.url)
    // Freshly saved items have no title yet; the panel falls back to
    // the host, so null must survive the mapping rather than becoming
    // an invented string.
    assert.equal(hit!.title, null)
  })
})

/* ================================================================== *
 * OWNERSHIP
 * ================================================================== */

describe("discovery — scope", () => {
  it("shows another owner's item as unanalyzed rather than describing it", async () => {
    const mine = await itemFor(owner, "private")
    await replaceItemConcepts(mine.id, [extracted("Confidential Subject")], scopeOf(owner))

    const seen = await discoverForItem(mine.id, scopeOf(sameOrgOther))
    assert.equal(seen.status, "not_analyzed")
    assert.deepEqual(seen.concepts, [], "another owner's concepts must not leak through the panel")
    assert.deepEqual(seen.related, [])
  })

  it("is not an existence oracle — a stranger's real item answers exactly like a fake id", async () => {
    // The route 404s before it gets here, but if the layer BELOW the
    // 404 answered differently for a real-but-not-yours id than for a
    // fabricated one, discovery would confirm which ids exist to
    // anyone who could reach it another way. Deep-equal, not
    // "both empty": a status, a count or a field that differs is the
    // whole leak.
    const real = await itemFor(owner, "oracle-real")
    await replaceItemConcepts(real.id, [extracted("Private Topic")], scopeOf(owner))

    const stranger = await discoverForItem(real.id, scopeOf(sameOrgOther))
    const fabricated = await discoverForItem("kn_00000000-0000-0000-0000-000000000000", scopeOf(sameOrgOther))

    assert.deepEqual(
      { ...stranger, itemId: "<id>" },
      { ...fabricated, itemId: "<id>" },
      "a real item you do not own must be indistinguishable from one that was never saved",
    )
  })

  it("does not surface an ARCHIVED item as related", async () => {
    // Archiving is the user saying "stop showing me this". Discovery
    // reintroducing it beside something they are reading would quietly
    // undo that.
    const live = await itemFor(owner, "arch-live")
    const archived = await itemFor(owner, "arch-hidden")
    await replaceItemConcepts(live.id, [extracted("Archived Overlap")], scopeOf(owner))
    await replaceItemConcepts(archived.id, [extracted("Archived Overlap")], scopeOf(owner))

    const before = (await discoverForItem(live.id, scopeOf(owner))).related.map((r) => r.id)
    assert.ok(before.includes(archived.id), "precondition: it is related while live")

    await repo.setArchived(archived.id, owner.orgId, owner.userId, true)

    const after = (await discoverForItem(live.id, scopeOf(owner))).related.map((r) => r.id)
    assert.ok(!after.includes(archived.id), "an archived item must drop out of related")
  })

  it("never lists another owner's item as related, even on a shared concept name", async () => {
    const mineA = await itemFor(owner, "mine-a")
    const mineB = await itemFor(owner, "mine-b")
    const theirs = await itemFor(sameOrgOther, "theirs")
    await replaceItemConcepts(mineA.id, [extracted("Overlapping Name")], scopeOf(owner))
    await replaceItemConcepts(mineB.id, [extracted("Overlapping Name")], scopeOf(owner))
    await replaceItemConcepts(theirs.id, [extracted("Overlapping Name")], scopeOf(sameOrgOther))

    const ids = (await discoverForItem(mineA.id, scopeOf(owner))).related.map((r) => r.id)
    assert.ok(ids.includes(mineB.id), "the owner's own sibling must still be found")
    assert.ok(!ids.includes(theirs.id), "a same-org, different-user item must not appear")
  })
})

/* ================================================================== *
 * THE ROUTE
 *
 * Asserted by source inspection: it imports next/server, which this
 * repo's plain-Node runner cannot load (same constraint and the same
 * remedy as tests/knowledge/indexing-route.test.ts).
 * ================================================================== */

describe("GET /api/knowledge/:id/related", () => {
  const source = readFileSync("app/api/knowledge/[id]/related/route.ts", "utf8")

  it("requires a session", () => {
    assert.match(source, /await requireSession\(\)/)
  })

  it("resolves the item with the owner predicate and 404s before describing anything", () => {
    // repo.getItem is (id, orgId, userId)-scoped. Reaching discovery
    // without it would answer "not_analyzed" for an id that belongs to
    // someone else — indistinguishable from a real answer, and a
    // confirmation that the id exists.
    assert.match(source, /repo\.getItem\(id, organizationId, userId\)/)
    const notFoundAt = source.indexOf("throw new NotFoundError()")
    const discoverAt = source.indexOf("discoverForItem(")
    assert.ok(notFoundAt > -1 && discoverAt > notFoundAt, "the 404 must come before the lookup")
  })

  it("passes the caller's own scope down, never a widened one", () => {
    assert.match(source, /discoverForItem\(id, \{ orgId: organizationId, userId \}\)/)
  })

  it("is not rate-limited, because it calls no model and costs nothing", () => {
    assert.doesNotMatch(source, /enforceRateLimit/)
  })

  it("is read-only — no write helper is imported", () => {
    assert.doesNotMatch(source, /\b(replaceItemConcepts|extractConceptsForItem|enqueue\w*Job|recordAudit)\b/)
  })
})

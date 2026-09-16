/* ================================================================== *
 * LIBRARY SEARCH — both retrievers, one ranking, one authorization
 * rule.
 *
 * The semantic engine existed for months and was reachable from one
 * place: Ask. The Library's own search box ran an ILIKE and nothing
 * else. This is the caller that was missing — so what these tests
 * exist to prove is not that retrieval works (it has its own tests)
 * but that JOINING the two did not open anything.
 *
 * THE CLAIM THAT MATTERS: a vector is never authorization. Semantic
 * retrieval hands back chunks, and a chunk names its item. That name
 * is a pointer. Every id is re-read under the caller's own scope
 * before it becomes a result, and the tests below try to get a
 * colleague's item back through exactly that path.
 *
 * Real PostgreSQL, real pgvector, a deterministic fake embedder. No
 * model is called; no credential is needed.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { EVIDENCE_MIN_SIMILARITY, boundedParam, searchLibrary } from "@/lib/knowledge/search/library"
import * as repo from "@/lib/knowledge/repo"

let owner: TestTenant
/** Same organization, different person — the attacker an org_id-only
 *  predicate lets through. */
let colleague: TestTenant
let otherOrg: TestTenant

before(async () => {
  await prepareDatabase()
})
beforeEach(async () => {
  owner = await createTenant("ls-owner")
  otherOrg = await createTenant("ls-otherorg")
  const mate = await createTenant("ls-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, mate.userId])
  colleague = { orgId: owner.orgId, userId: mate.userId }
})
after(closeTestPool)

const scopeOf = (t: TestTenant) => ({ orgId: t.orgId, userId: t.userId })

/* A fake embedder whose vectors are a function of the TEXT, so
 * "similar" is a property this test controls rather than a property of
 * a provider nobody called. Every document containing the marker word
 * lands on the same axis as a query containing it. */
function fakeEmbeddings(marker: string): EmbeddingProvider {
  const vec = (text: string) => {
    const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
    v[text.toLowerCase().includes(marker) ? 0 : 1] = 1
    return v
  }
  return {
    id: "fake",
    model: "library-search-model",
    dimensions: EMBEDDING_DIMENSIONS,
    isConfigured: () => true,
    embedDocument: async (text: string) => ({ values: vec(text), model: "library-search-model", provider: "fake" }),
    embedQuery: async (text: string) => ({ values: vec(text), model: "library-search-model", provider: "fake" }),
  }
}

let seq = 0
async function save(t: TestTenant, title: string, body: string, opts: { archived?: boolean } = {}) {
  seq += 1
  const id = `kn_${randomUUID()}`
  const now = Date.now() + seq
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived,
                                  title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,$5,$6,'Example','example.test',$7,$8,$8)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, opts.archived ?? false, title, body, now],
  )
  return id
}

/** Saves AND indexes AND embeds, so the item is reachable by both
 *  retrievers. */
async function indexed(t: TestTenant, title: string, body: string, marker: string, opts: { archived?: boolean } = {}) {
  const id = await save(t, title, body, opts)
  await indexItem({ itemId: id, orgId: t.orgId, userId: t.userId })
  await embedItemChunks({ itemId: id, orgId: t.orgId, userId: t.userId }, { embeddings: fakeEmbeddings(marker) })
  return id
}

const LONG = (phrase: string) =>
  `${phrase}. ` +
  "This passage is written long enough that the chunker produces a real chunk from it rather than discarding it as a fragment, which is what the retrieval path needs in order to have anything at all to return. ".repeat(
    2,
  )

/* ================================================================== *
 * BOTH RETRIEVERS
 * ================================================================== */

describe("searchLibrary — two retrievers, one ranking", () => {
  it("finds an item by words in its TITLE that never appear in its body", async () => {
    // The lexical half's job. A chunk carries text, not the title, so
    // semantic retrieval alone cannot answer this.
    const id = await indexed(owner, "Zorblatt quarterly", LONG("margins narrowed across tooling"), "margin")
    const { results } = await searchLibrary("Zorblatt", scopeOf(owner), { deps: { embeddings: fakeEmbeddings("margin") } })
    assert.deepEqual(results.map((r) => r.row.id), [id])
  })

  it("finds an item by MEANING, for words the query does not share with it", async () => {
    // The semantic half's job, isolated: the query shares no term with
    // the document, so the lexical retriever returns nothing and only
    // the vector can produce this result.
    const embeddings = fakeEmbeddings("quiglefan")
    const id = await indexed(owner, "Untitled note", LONG("The quiglefan mechanism is described here"), "quiglefan")

    const lexicalOnly = await repo.searchItems(owner.orgId, owner.userId, "hoobastank", 20)
    assert.deepEqual(lexicalOnly, [], "precondition: lexical finds nothing for this query")

    const { results, retrieval } = await searchLibrary("hoobastank quiglefan", scopeOf(owner), { deps: { embeddings } })
    assert.ok(retrieval.semantic > 0, "semantic retrieval must have contributed")
    assert.deepEqual(results.map((r) => r.row.id), [id])
  })

  it("ranks an item both retrievers found above one only the lexical retriever could reach", async () => {
    // The property RRF exists for, asserted at the item level where it
    // is now applied.
    //
    // The comparison item is saved but NOT indexed, so it has no chunks
    // and no vectors and cannot appear in the semantic list at all.
    // That is what makes this a test of agreement: an item that merely
    // ranks LOW semantically is still IN the semantic list — the
    // retriever returns candidates by distance, it does not exclude
    // them — and two items that both appear in both lists in opposite
    // orders score identically under RRF, by construction. An earlier
    // version of this test built exactly that symmetric case and
    // asserted an asymmetric outcome, so it passed or failed on the
    // tie-break, which is a UUID.
    const embeddings = fakeEmbeddings("quiglefan")
    const both = await indexed(owner, "Quiglefan in practice", LONG("The quiglefan mechanism in practice"), "quiglefan")
    const lexicalOnly = await save(owner, "Quiglefan mentioned once", "Unrelated content entirely.")

    const { results } = await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })
    const ids = results.map((r) => r.row.id)
    assert.ok(ids.includes(both) && ids.includes(lexicalOnly), "both are lexical matches")
    assert.equal(ids[0], both, "agreement between retrievers is the strongest signal")
  })

  it("orders two items with identical evidence the same way every time", async () => {
    // When RRF genuinely ties — the same two lists in opposite orders,
    // which is a real and common outcome — the order still has to be
    // stable, or a user watching a results list sees it reshuffle for
    // no reason. reciprocalRankFusion breaks ties on id; this pins that
    // the tie-break survives the whole path.
    const embeddings = fakeEmbeddings("quiglefan")
    await indexed(owner, "Quiglefan one", LONG("The quiglefan mechanism"), "quiglefan")
    await indexed(owner, "Quiglefan two", LONG("The quiglefan mechanism"), "quiglefan")

    const runs = await Promise.all(
      [0, 1, 2].map(() => searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })),
    )
    const [first, ...rest] = runs.map((r) => r.results.map((x) => x.row.id))
    for (const other of rest) assert.deepEqual(other, first)
  })

  it("still answers when no embedding provider is configured", async () => {
    // Semantic search fails open by design. The Library must degrade to
    // the lexical ranking it always had, not to nothing.
    const id = await save(owner, "Retrieval quality", "Body text about retrieval.")
    const { results, retrieval } = await searchLibrary("retrieval", scopeOf(owner), {
      deps: {
        embeddings: {
          id: "none",
          model: "none",
          dimensions: EMBEDDING_DIMENSIONS,
          isConfigured: () => false,
          embedDocument: async () => {
            throw new Error("not configured")
          },
          embedQuery: async () => {
            throw new Error("not configured")
          },
        },
      },
    })
    assert.deepEqual(results.map((r) => r.row.id), [id])
    assert.equal(retrieval.semantic, 0)
    assert.equal(retrieval.semanticSearch.enabled, false)
  })

  it("treats a one-character query as a no-op, not as the whole library", async () => {
    await save(owner, "Something", "Body.")
    const { results, total } = await searchLibrary("a", scopeOf(owner))
    assert.deepEqual(results, [])
    assert.equal(total, 0)
  })

  it("returns each item once, however many of its passages matched", async () => {
    const embeddings = fakeEmbeddings("quiglefan")
    const id = await indexed(
      owner,
      "Quiglefan",
      `${LONG("quiglefan one")} ${LONG("quiglefan two")} ${LONG("quiglefan three")}`,
      "quiglefan",
    )
    const { results } = await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })
    assert.deepEqual(results.map((r) => r.row.id), [id])
  })
})

/* ================================================================== *
 * EVIDENCE
 * ================================================================== */

describe("searchLibrary — showing why a result is here", () => {
  it("attaches the passage that earned a semantic match", async () => {
    const embeddings = fakeEmbeddings("quiglefan")
    const id = await indexed(owner, "Untitled", LONG("The quiglefan mechanism is described here"), "quiglefan")

    const [hit] = (await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })).results
    assert.equal(hit.row.id, id)
    assert.ok(hit.evidence, "a semantic match must be able to show what matched")
    assert.match(hit.evidence!.snippet, /quiglefan/i, "and the snippet must be the passage, not a description of it")
    // The id names a chunk that really exists on this item, rather than
    // matching a prefix the test invented.
    const stored = await repo.getChunks(id, owner.orgId, owner.userId)
    assert.ok(
      stored.some((c) => c.id === hit.evidence!.chunkId),
      "the evidence must point at a passage the item actually has",
    )
    assert.equal(typeof hit.evidence!.ordinal, "number")
    assert.ok(hit.evidence!.similarity >= EVIDENCE_MIN_SIMILARITY)
  })

  it("attaches NOTHING to a lexical-only match — there is no passage behind a title", async () => {
    // The rule that keeps this honest. An item found because its title
    // matched has no chunk to point at, and inventing a snippet would
    // put an explanation under a result the explanation did not cause.
    const embeddings = fakeEmbeddings("quiglefan")
    await save(owner, "Quiglefan in the title only", "Body about something else entirely.")

    const [hit] = (await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })).results
    assert.equal(hit.evidence, undefined)
  })

  it("attaches nothing when the nearest passage is not actually close", async () => {
    // Semantic retrieval returns NEAREST neighbours, not good ones: in a
    // small library the nearest passage to any query is whatever exists.
    // Ranking can live with that; a claim cannot.
    const embeddings = fakeEmbeddings("quiglefan")
    await indexed(owner, "Quiglefan in the title", LONG("Entirely unrelated prose"), "nothing-matches-this")

    const [hit] = (await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })).results
    assert.ok(hit, "the item still appears — the floor gates the explanation, not the ranking")
    assert.equal(hit.evidence, undefined)
  })

  it("truncates the snippet for display without touching the stored chunk", async () => {
    const embeddings = fakeEmbeddings("quiglefan")
    const id = await indexed(owner, "Long", LONG("The quiglefan mechanism is described at length here"), "quiglefan")

    const [hit] = (await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })).results
    const stored = await repo.getChunks(id, owner.orgId, owner.userId)
    assert.ok(hit.evidence!.snippet.length <= stored[0].text.length + 1, "display text is never longer than the chunk")
    assert.ok(stored[0].text.length > 0, "and the chunk itself is untouched")
  })

  it("never attaches a COLLEAGUE's passage to anything", async () => {
    // Evidence is attached AFTER the scoped re-read, so a passage
    // cannot carry an item into the results and cannot appear beside
    // one it does not belong to.
    const embeddings = fakeEmbeddings("quiglefan")
    await indexed(colleague, "Theirs", LONG("The quiglefan mechanism, privately"), "quiglefan")
    const mine = await save(owner, "Quiglefan mine", "Nothing about it in the body.")

    const { results } = await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })
    assert.deepEqual(results.map((r) => r.row.id), [mine])
    assert.equal(results[0].evidence, undefined, "their passage is not my evidence")
  })
})

/* ================================================================== *
 * PAGINATION
 * ================================================================== */

describe("searchLibrary — pagination", () => {
  it("pages without repeating or dropping a result", async () => {
    const ids: string[] = []
    for (let i = 0; i < 5; i += 1) ids.push(await save(owner, `Retrieval note ${i}`, "About retrieval."))

    const first = await searchLibrary("retrieval", scopeOf(owner), { limit: 2, offset: 0 })
    const second = await searchLibrary("retrieval", scopeOf(owner), { limit: 2, offset: 2 })
    const third = await searchLibrary("retrieval", scopeOf(owner), { limit: 2, offset: 4 })

    const seen = [...first.results, ...second.results, ...third.results].map((r) => r.row.id)
    assert.equal(seen.length, 5)
    assert.equal(new Set(seen).size, 5, "no result appears on two pages")
    assert.equal(first.total, 5, "total describes the whole result set, not the page")
  })

  it("is deterministic — the same query twice gives the same order", async () => {
    for (let i = 0; i < 4; i += 1) await save(owner, `Retrieval note ${i}`, "About retrieval.")
    const a = await searchLibrary("retrieval", scopeOf(owner))
    const b = await searchLibrary("retrieval", scopeOf(owner))
    assert.deepEqual(a.results.map((r) => r.row.id), b.results.map((r) => r.row.id))
  })
})

/* ================================================================== *
 * AUTHORIZATION
 * ================================================================== */

describe("searchLibrary — a vector is never authorization", () => {
  it("never returns a COLLEAGUE's item, by meaning or by word", async () => {
    const embeddings = fakeEmbeddings("quiglefan")
    await indexed(colleague, "Their quiglefan memo", LONG("The quiglefan mechanism, privately"), "quiglefan")

    const { results } = await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })
    assert.deepEqual(results, [], "same organization is not the same library")
  })

  it("never returns another ORGANIZATION's item", async () => {
    const embeddings = fakeEmbeddings("quiglefan")
    await indexed(otherOrg, "Their quiglefan memo", LONG("The quiglefan mechanism, privately"), "quiglefan")
    assert.deepEqual((await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })).results, [])
  })

  it("does not return an item whose CHUNK matched but whose row is not mine", async () => {
    // The joint-path leak, made concrete. Semantic retrieval is scoped
    // — but if it ever were not, the re-read under the caller's scope
    // is the second lock, and this asserts the door is locked twice.
    const embeddings = fakeEmbeddings("quiglefan")
    const theirs = await indexed(colleague, "Theirs", LONG("The quiglefan mechanism"), "quiglefan")

    // Straight at the re-read, holding their real id — which is exactly
    // what an attacker who saw an id once possesses.
    assert.deepEqual(await repo.getItemsByIds([theirs], owner.orgId, owner.userId), [])
    assert.deepEqual((await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })).results, [])
  })

  it("excludes ARCHIVED items from both retrievers", async () => {
    const embeddings = fakeEmbeddings("quiglefan")
    const live = await indexed(owner, "Quiglefan live", LONG("The quiglefan mechanism"), "quiglefan")
    const gone = await indexed(owner, "Quiglefan archived", LONG("The quiglefan mechanism"), "quiglefan", {
      archived: true,
    })

    const { results } = await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })
    const ids = results.map((r) => r.row.id)
    assert.ok(ids.includes(live))
    assert.ok(!ids.includes(gone), "archiving means it stops appearing, in search as everywhere else")
    assert.deepEqual(await repo.getItemsByIds([gone], owner.orgId, owner.userId), [], "and the re-read drops it too")
  })

  it("shows each person their own results for the same query in a shared organization", async () => {
    const embeddings = fakeEmbeddings("quiglefan")
    const mine = await indexed(owner, "Mine", LONG("The quiglefan mechanism"), "quiglefan")
    const theirs = await indexed(colleague, "Theirs", LONG("The quiglefan mechanism"), "quiglefan")

    assert.deepEqual((await searchLibrary("quiglefan", scopeOf(owner), { deps: { embeddings } })).results.map((r) => r.row.id), [mine])
    assert.deepEqual(
      (await searchLibrary("quiglefan", scopeOf(colleague), { deps: { embeddings } })).results.map((r) => r.row.id),
      [theirs],
    )
  })
})

/* ================================================================== *
 * THE ROUTE AND THE SURFACE
 *
 * Source-inspected: the route imports next/server, which this repo's
 * plain-Node runner cannot load.
 * ================================================================== */

describe("boundedParam — absent is not zero", () => {
  it("returns the fallback for a MISSING parameter", () => {
    // The bug this exists to have fixed, and it was silent: Number(null)
    // is 0, so a missing ?limit= became a limit of zero, then of one
    // after the Math.max guard — every search returned exactly one
    // result with a total beside it saying there were more. Caught by
    // noticing that mismatch in a real response, not by a test failing.
    assert.equal(boundedParam(null, 20, 50), 20)
    assert.equal(boundedParam(undefined, 20, 50), 20)
    assert.equal(boundedParam("", 20, 50), 20)
    assert.equal(boundedParam("   ", 20, 50), 20)
  })

  it("returns the fallback for anything that is not a whole, non-negative number", () => {
    for (const bad of ["abc", "1.5", "-3", "NaN", "Infinity", "1e400", "0x10"]) {
      assert.equal(boundedParam(bad, 20, 50), 20, `accepted ${bad}`)
    }
  })

  it("accepts a real value and clamps it to the maximum", () => {
    assert.equal(boundedParam("7", 20, 50), 7)
    assert.equal(boundedParam("0", 20, 50), 0, "an explicit zero is a real answer, unlike a missing one")
    assert.equal(boundedParam("999999", 20, 50), 50)
  })
})

describe("GET /api/knowledge/search — the evidence it returns", () => {
  const source = readFileSync("app/api/knowledge/search/route.ts", "utf8")

  it("keys evidence by item, outside the card model", () => {
    // A KnowledgeItem is what the Library renders in every view. It
    // must not gain a field that only means something during a search,
    // or every other surface inherits a shape it cannot fill.
    assert.match(source, /const evidence: Record<string, SearchEvidence> = \{\}/)
    assert.match(source, /if \(r\.evidence\) evidence\[r\.row\.id\] = r\.evidence/)
  })

  it("passes the caller's own scope, never a widened one", () => {
    assert.match(source, /searchLibrary\(q, \{ orgId: organizationId, userId \}/)
  })

  it("bounds limit and offset rather than trusting them", () => {
    assert.match(source, /MAX_SEARCH_LIMIT/)
    assert.match(source, /boundedParam\(params\.get\("limit"\)/)
    assert.match(source, /boundedParam\(params\.get\("offset"\)/)
  })
})

describe("the search result card", () => {
  const source = readFileSync("components/knowledge/knowledge-card.tsx", "utf8")

  it("shows a snippet ONLY when there is real evidence", () => {
    // The fallback order is evidence → summary → excerpt. If evidence
    // were rendered unconditionally, a lexical result would show an
    // empty quote under "matched in your library".
    assert.match(source, /\{evidence \? \(\s*<EvidenceNote/)
  })

  it("reaches Ask through the existing helper, not a new endpoint", () => {
    assert.match(source, /askAboutHref\(/)
    assert.doesNotMatch(source, /\/api\/knowledge\/ai/, "the card must not call the answering API itself")
  })

  it("builds the question deterministically — no model is asked to phrase it", () => {
    assert.match(source, /What does my library say about/)
  })
})

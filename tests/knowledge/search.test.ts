/* ================================================================== *
 * RETRIEVAL — against real PostgreSQL, real GIN and real HNSW.
 *
 * The claims worth testing are SQL predicates and index behaviour:
 * does the owner filter really keep one user's passages away from
 * another; does an archived item really drop out; does the vector
 * query really order by distance. A fake database would let all three
 * pass while broken.
 *
 * Embeddings come from a deterministic fake, never a real provider —
 * these tests must cost nothing to run. The fake returns a real
 * 768-wide vector so the column type, the dimension CHECK and the
 * HNSW index are all genuinely exercised.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { searchKnowledge } from "@/lib/knowledge/search"

/** A deterministic stand-in for Gemini.
 *
 * Each distinct topic word gets its own axis, so a query about
 * "chunking" lands nearest the passage about chunking — the vector
 * space is fake but the ORDERING it produces is meaningful, which is
 * what the semantic query is being tested on. */
const AXES = ["chunking", "embedding", "authentication", "gardening"]

function fakeVector(text: string): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
  const lower = text.toLowerCase()
  AXES.forEach((axis, i) => {
    if (lower.includes(axis)) v[i] = 1
  })
  // Never all-zero: cosine distance is undefined for a zero vector.
  v[AXES.length] = 0.01
  return v
}

const fakeProvider: EmbeddingProvider = {
  id: "fake",
  model: "fake-embed-1",
  dimensions: EMBEDDING_DIMENSIONS,
  isConfigured: () => true,
  embedDocument: async (input) => ({ values: fakeVector(input), model: "fake-embed-1", provider: "fake" }),
  embedQuery: async (input) => ({ values: fakeVector(input), model: "fake-embed-1", provider: "fake" }),
}

const unconfiguredProvider: EmbeddingProvider = {
  ...fakeProvider,
  isConfigured: () => false,
}

const DOCS = {
  chunking: "Most retrieval failures are chunking failures rather than model failures, and the distinction matters.",
  embedding: "An embedding model mismatched to the domain is invisible in evaluation and obvious in production.",
  auth: "Authentication should never be rebuilt when a working provider is already wired into the application.",
}

async function saveAndIndex(t: TestTenant, text: string, opts: { archived?: boolean; title?: string } = {}) {
  const p = getTestPool()
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await p.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,$5,$6,'Example','example.test',$7,$8,$8)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, opts.archived ?? false, opts.title ?? "A saved piece", text, now],
  )
  await indexItem({ itemId: id, orgId: t.orgId, userId: t.userId })
  await embedItemChunks({ itemId: id, orgId: t.orgId, userId: t.userId }, { embeddings: fakeProvider })
  return id
}

describe("lexical retrieval", () => {
  let alice: TestTenant
  let chunkingItem: string

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("lex")
    chunkingItem = await saveAndIndex(alice, DOCS.chunking)
    await saveAndIndex(alice, DOCS.auth)
  })
  after(closeTestPool)

  it("finds the passage that contains the words", async () => {
    const result = await searchKnowledge({ query: "chunking failures", scope: alice, mode: "lexical" })
    assert.ok(result.chunks.length > 0, "expected a lexical hit")
    assert.equal(result.chunks[0].knowledgeItemId, chunkingItem)
    assert.equal(result.executed.lexical, true)
    assert.equal(result.executed.semantic, false)
  })

  it("returns citation metadata, not just text", async () => {
    const [hit] = (await searchKnowledge({ query: "chunking", scope: alice, mode: "lexical" })).chunks
    assert.ok(hit.chunkId && hit.knowledgeItemId)
    assert.equal(hit.title, "A saved piece")
    assert.equal(hit.source, "Example")
    assert.equal(hit.metadata.domain, "example.test")
    assert.ok(hit.metadata.url.startsWith("https://example.test/"))
    assert.equal(typeof hit.ordinal, "number")
  })

  it("does not match partial words — the ILIKE bug this replaced", async () => {
    // "art" used to match "smart"; a word index must not.
    const result = await searchKnowledge({ query: "chunk", scope: alice, mode: "lexical" })
    assert.equal(result.chunks.length, 0, "a prefix must not match a whole word")
  })

  it("treats a short or empty query as a no-op, not as 'everything'", async () => {
    for (const query of ["", " ", "a"]) {
      const result = await searchKnowledge({ query, scope: alice, mode: "lexical" })
      assert.equal(result.chunks.length, 0, `"${query}" should return nothing`)
      assert.equal(result.executed.lexical, false, "no query should reach the database")
    }
  })

  it("does not throw on punctuation a tsquery parser would reject", async () => {
    // plainto_tsquery, not to_tsquery — otherwise this is a 500.
    for (const query of ["chunking & failures", "what about (this)?", "a | b", "!!!"]) {
      await assert.doesNotReject(() => searchKnowledge({ query, scope: alice, mode: "lexical" }))
    }
  })

  it("respects the limit", async () => {
    const result = await searchKnowledge({ query: "failures", scope: alice, mode: "lexical", limit: 1 })
    assert.ok(result.chunks.length <= 1)
  })
})

describe("semantic retrieval", () => {
  let alice: TestTenant
  let chunkingItem: string
  let gardeningItem: string

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("sem")
    chunkingItem = await saveAndIndex(alice, DOCS.chunking)
    gardeningItem = await saveAndIndex(alice, "Gardening in clay soil rewards patience more than it rewards effort.")
  })
  after(closeTestPool)

  it("finds the nearest passage in vector space", async () => {
    const result = await searchKnowledge(
      { query: "chunking", scope: alice, mode: "semantic" },
      { embeddings: fakeProvider },
    )
    assert.ok(result.chunks.length > 0)
    assert.equal(result.chunks[0].knowledgeItemId, chunkingItem)
    assert.equal(result.executed.semantic, true)
    assert.equal(result.executed.lexical, false)
  })

  it("orders by distance: the unrelated passage ranks below", async () => {
    const result = await searchKnowledge(
      { query: "gardening", scope: alice, mode: "semantic" },
      { embeddings: fakeProvider },
    )
    assert.equal(result.chunks[0].knowledgeItemId, gardeningItem)
  })

  it("degrades to nothing — never throws — when no provider is configured", async () => {
    // A deployment without a Gemini key must still work. The result
    // has to SAY it ran nothing, so a silently degraded system does
    // not look healthy.
    const result = await searchKnowledge(
      { query: "chunking", scope: alice, mode: "semantic" },
      { embeddings: unconfiguredProvider },
    )
    assert.equal(result.executed.semantic, false)
    assert.equal(result.chunks.length, 0)
  })

  it("survives a provider that throws, without failing the search", async () => {
    const broken: EmbeddingProvider = {
      ...fakeProvider,
      embedQuery: async () => {
        throw new Error("provider is down")
      },
    }
    const result = await searchKnowledge({ query: "chunking", scope: alice, mode: "semantic" }, { embeddings: broken })
    assert.equal(result.executed.semantic, false, "a provider outage must be reported, not hidden")
  })
})

describe("hybrid retrieval", () => {
  let alice: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("hyb")
    await saveAndIndex(alice, DOCS.chunking)
    await saveAndIndex(alice, DOCS.embedding)
    await saveAndIndex(alice, DOCS.auth)
  })
  after(closeTestPool)

  it("runs both retrievers and reports that it did", async () => {
    const result = await searchKnowledge(
      { query: "chunking failures", scope: alice, mode: "hybrid" },
      { embeddings: fakeProvider },
    )
    assert.equal(result.executed.lexical, true)
    assert.equal(result.executed.semantic, true)
    assert.ok(result.candidates.lexical > 0)
    assert.ok(result.candidates.semantic > 0)
    assert.ok(result.chunks.length > 0)
  })

  it("is the default mode", async () => {
    const result = await searchKnowledge({ query: "chunking", scope: alice }, { embeddings: fakeProvider })
    assert.equal(result.mode, "hybrid")
  })

  it("falls back to lexical alone when the provider is unavailable", async () => {
    const result = await searchKnowledge(
      { query: "chunking failures", scope: alice, mode: "hybrid" },
      { embeddings: unconfiguredProvider },
    )
    assert.equal(result.executed.lexical, true)
    assert.equal(result.executed.semantic, false)
    assert.ok(result.chunks.length > 0, "hybrid must still answer from lexical alone")
  })

  it("returns each chunk once, with a fused score", async () => {
    const result = await searchKnowledge(
      { query: "chunking failures", scope: alice, mode: "hybrid" },
      { embeddings: fakeProvider },
    )
    const ids = result.chunks.map((c) => c.chunkId)
    assert.equal(new Set(ids).size, ids.length, "a chunk found by both retrievers must appear once")
    for (const c of result.chunks) assert.ok(c.score > 0)
    const scores = result.chunks.map((c) => c.score)
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), "results must be ordered by fused score")
  })

  it("does not rerank unless asked — a results list is not an answer", async () => {
    // Reranking trades precision for diversity, which is right for a
    // generated answer and wrong for a browse UI. Defaulting it on
    // would change /api/knowledge/search behaviour invisibly.
    let called = 0
    await searchKnowledge(
      { query: "chunking failures", scope: alice, mode: "hybrid" },
      {
        embeddings: fakeProvider,
        reranker: { id: "spy", async rerank(_q, chunks) { called += 1; return [...chunks] } },
      },
    )
    assert.equal(called, 0)
  })

  it("reranks every fused candidate, not just the ones that made the cut", async () => {
    // The chunk a reranker should promote is usually the one ranked
    // just below the limit. Truncating first would hide it.
    let seen = 0
    const result = await searchKnowledge(
      { query: "chunking failures", scope: alice, mode: "hybrid", limit: 2, rerank: true },
      {
        embeddings: fakeProvider,
        reranker: {
          id: "spy",
          async rerank(_q, chunks, options) {
            seen = chunks.length
            return chunks.slice(0, options.topK)
          },
        },
      },
    )
    assert.ok(seen > 2, `reranker saw only ${seen} candidates — it was handed a truncated list`)
    assert.equal(result.chunks.length, 2)
  })
})

describe("authorization", () => {
  let alice: TestTenant
  let bob: TestTenant
  let carol: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("owner")
    bob = await createTenant("otherorg")
    const c = await createTenant("sameorg")
    carol = { orgId: alice.orgId, userId: c.userId }
    await getTestPool().query("INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1,$2,'member',$3)", [
      carol.userId, alice.orgId, Date.now(),
    ])
    await saveAndIndex(alice, DOCS.chunking)
  })
  after(closeTestPool)

  for (const mode of ["lexical", "semantic", "hybrid"] as const) {
    it(`${mode}: another organization retrieves nothing`, async () => {
      const result = await searchKnowledge({ query: "chunking failures", scope: bob, mode }, { embeddings: fakeProvider })
      assert.equal(result.chunks.length, 0, `${mode} leaked across organizations`)
    })

    it(`${mode}: another user in the same organization retrieves nothing`, async () => {
      // The case an org-only filter gets wrong, checked on every path.
      const result = await searchKnowledge({ query: "chunking failures", scope: carol, mode }, { embeddings: fakeProvider })
      assert.equal(result.chunks.length, 0, `${mode} leaked across users in one org`)
    })
  }

  it("archived content is excluded by default and returned only when asked for", async () => {
    const archivedId = await saveAndIndex(alice, "Archived thoughts about chunking strategies.", { archived: true })

    const byDefault = await searchKnowledge({ query: "chunking", scope: alice, mode: "lexical" })
    assert.ok(
      !byDefault.chunks.some((c) => c.knowledgeItemId === archivedId),
      "archived is the user's own 'put this away' — answering from it by default undoes that",
    )

    const explicit = await searchKnowledge({
      query: "chunking", scope: alice, mode: "lexical", filters: { includeArchived: true },
    })
    assert.ok(explicit.chunks.some((c) => c.knowledgeItemId === archivedId))
  })

  it("an itemIds filter narrows the search but cannot widen the scope", async () => {
    const mine = await saveAndIndex(alice, DOCS.embedding)
    const theirs = await saveAndIndex(bob, DOCS.embedding)

    const narrowed = await searchKnowledge({ query: "embedding", scope: alice, mode: "lexical", filters: { itemIds: [mine] } })
    assert.ok(narrowed.chunks.every((c) => c.knowledgeItemId === mine))

    // Asking for someone else's item by id must return nothing — the
    // filter intersects the scope, it does not replace it.
    const attempted = await searchKnowledge({ query: "embedding", scope: alice, mode: "lexical", filters: { itemIds: [theirs] } })
    assert.equal(attempted.chunks.length, 0, "a filter must never reach outside the caller's scope")
  })
})

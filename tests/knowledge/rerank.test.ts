/* ================================================================== *
 * RERANKING — the property, not the arithmetic.
 *
 * MMR's job here is one thing: stop a single well-matching article
 * from occupying every slot, because an answer built from five chunks
 * of one page cites one source while claiming to have read a library.
 * These tests assert that behaviour and the guarantees around it
 * (determinism, topK, no invented or dropped chunks) rather than the
 * lambda formula, so swapping in a cross-encoder later should leave
 * most of this file passing.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createMmrReranker, rerankKnowledge } from "@/lib/knowledge/search/rerank"
import type { RetrievedChunk } from "@/lib/knowledge/search/types"

function chunk(chunkId: string, itemId: string, score: number, snippet: string): RetrievedChunk {
  return {
    knowledgeItemId: itemId,
    chunkId,
    score,
    title: itemId,
    source: "example.com",
    snippet,
    ordinal: 0,
    charStart: null,
    charEnd: null,
    metadata: { domain: "example.com", url: `https://example.com/${itemId}`, lang: "en", publishedAt: null },
  }
}

const A1 = "Vector search finds passages by embedding similarity rather than keywords."
const A2 = "Vector search finds passages by embedding similarity, not keywords at all."
const A3 = "Embedding similarity is how vector search finds passages instead of keywords."
const A4 = "Passages are found by embedding similarity in vector search, not by keywords."
const B1 = "Postgres full text search uses a GIN index over a generated tsvector column."

/** Four near-identical passages from one article, and a comparably
 *  relevant passage from a different one. Pure relevance ranking
 *  returns the four near-duplicates; that is the failure this exists
 *  to prevent. */
const DOMINANT = [
  chunk("a1", "item-a", 0.99, A1),
  chunk("a2", "item-a", 0.98, A2),
  chunk("a3", "item-a", 0.97, A3),
  chunk("a4", "item-a", 0.96, A4),
  chunk("b1", "item-b", 0.95, B1),
]

/** The same shape, but the other article is genuinely far less
 *  relevant. Diversity must NOT rescue it — a reranker that promotes
 *  weak evidence for being different is worse than no reranker. */
const LOPSIDED = [
  chunk("a1", "item-a", 0.99, A1),
  chunk("a2", "item-a", 0.98, A2),
  chunk("a3", "item-a", 0.97, A3),
  chunk("a4", "item-a", 0.96, A4),
  chunk("b1", "item-b", 0.20, B1),
]

describe("MMR reranking", () => {
  it("promotes a different source over a fourth near-duplicate", async () => {
    const ranked = await rerankKnowledge("vector search", DOMINANT, { topK: 3 }, createMmrReranker())
    const items = new Set(ranked.map((c) => c.knowledgeItemId))
    assert.equal(ranked.length, 3)
    assert.ok(
      items.has("item-b"),
      `one article took every slot: ${JSON.stringify(ranked.map((c) => c.chunkId))}`,
    )
  })

  it("does not rescue a much less relevant chunk just for being different", async () => {
    const ranked = await rerankKnowledge("vector search", LOPSIDED, { topK: 3 })
    assert.deepEqual(
      ranked.map((c) => c.knowledgeItemId),
      ["item-a", "item-a", "item-a"],
      "weak evidence promoted for novelty is worse than no reranking",
    )
  })

  it("demotes near-duplicates within one article", async () => {
    // Even where one source deserves every slot, the passages chosen
    // should be the ones that add something.
    const ranked = await rerankKnowledge("vector search", LOPSIDED, { topK: 2 })
    assert.equal(ranked[0].chunkId, "a1")
    assert.notEqual(ranked[1].chunkId, "a2", "the most redundant runner-up should not be second")
  })

  it("still puts the most relevant chunk first", async () => {
    // Diversity is a tie-breaker, not a re-ordering. If the best
    // candidate can be displaced, the reranker is hurting precision.
    const ranked = await rerankKnowledge("vector search", DOMINANT, { topK: 3 })
    assert.equal(ranked[0].chunkId, "a1")
  })

  it("lambda = 1 is pure relevance — MMR effectively off", async () => {
    const ranked = await rerankKnowledge("vector search", DOMINANT, { topK: 4, lambda: 1 })
    assert.deepEqual(ranked.map((c) => c.chunkId), ["a1", "a2", "a3", "a4"])
  })

  it("lambda = 0 is pure diversity", async () => {
    const ranked = await rerankKnowledge("vector search", DOMINANT, { topK: 2, lambda: 0 })
    assert.equal(ranked[1].knowledgeItemId, "item-b")
  })

  it("returns exactly topK when there are more candidates", async () => {
    const ranked = await rerankKnowledge("vector search", DOMINANT, { topK: 2 })
    assert.equal(ranked.length, 2)
  })

  it("returns everything when there are fewer candidates than topK", async () => {
    const ranked = await rerankKnowledge("vector search", DOMINANT.slice(0, 2), { topK: 10 })
    assert.equal(ranked.length, 2)
  })

  it("never invents, duplicates or mutates a chunk", async () => {
    const ranked = await rerankKnowledge("vector search", DOMINANT, { topK: 5 })
    const ids = ranked.map((c) => c.chunkId)
    assert.equal(new Set(ids).size, ids.length)
    for (const c of ranked) assert.ok(DOMINANT.includes(c), `${c.chunkId} is not one of the candidates`)
  })

  it("is deterministic regardless of input order", async () => {
    const forward = await rerankKnowledge("vector search", DOMINANT, { topK: 4 })
    const reversed = await rerankKnowledge("vector search", [...DOMINANT].reverse(), { topK: 4 })
    assert.deepEqual(forward.map((c) => c.chunkId), reversed.map((c) => c.chunkId))
  })

  it("breaks ties on chunk id when every score is equal", async () => {
    const flat = [
      chunk("z", "item-z", 0.5, "alpha beta gamma"),
      chunk("a", "item-a", 0.5, "delta epsilon zeta"),
    ]
    const ranked = await rerankKnowledge("q", flat, { topK: 2 })
    assert.equal(ranked[0].chunkId, "a")
  })

  it("handles an empty and a single-chunk candidate set", async () => {
    assert.deepEqual(await rerankKnowledge("q", [], { topK: 5 }), [])
    const one = await rerankKnowledge("q", [DOMINANT[0]], { topK: 5 })
    assert.deepEqual(one.map((c) => c.chunkId), ["a1"])
  })

  it("does not fall over on passages with no scoreable words", async () => {
    const odd = [chunk("p1", "i1", 1, "— — —"), chunk("p2", "i2", 0.5, "!!! ???")]
    const ranked = await rerankKnowledge("q", odd, { topK: 2 })
    assert.equal(ranked.length, 2)
  })

  it("costs no model call — the provider is synchronous work only", async () => {
    // A reranker that reached the network would run on every question.
    // If a future provider does, this seam is where the cost decision
    // gets made explicitly rather than by accident.
    const provider = createMmrReranker()
    assert.equal(provider.id, "mmr")
    const started = Date.now()
    await provider.rerank("q", DOMINANT, { topK: 5 })
    assert.ok(Date.now() - started < 250)
  })
})

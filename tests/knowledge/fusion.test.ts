/* ================================================================== *
 * RECIPROCAL RANK FUSION — pure, so every property is checkable.
 *
 * The reason RRF is here at all is that ts_rank and cosine similarity
 * are not on the same scale, and any normalisation that puts them
 * there makes a document's score depend on what else happened to be
 * retrieved. These tests pin the behaviour that buys: agreement
 * between retrievers beats brilliance in one.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { reciprocalRankFusion, RRF_K } from "@/lib/knowledge/search/fusion"

const ids = (...xs: string[]) => xs.map((id) => ({ id }))

describe("reciprocal rank fusion", () => {
  it("returns nothing for two empty lists", () => {
    assert.deepEqual(reciprocalRankFusion([], []), [])
  })

  it("preserves a single list's order when the other is empty", () => {
    const fused = reciprocalRankFusion(ids("a", "b", "c"), [])
    assert.deepEqual(fused.map((f) => f.id), ["a", "b", "c"])
    assert.ok(fused[0].score > fused[1].score && fused[1].score > fused[2].score)
  })

  it("a document both retrievers rank second beats one only the first ranks first", () => {
    // The central property. "top of one list" is a weaker signal than
    // "near the top of both", and this is the case that shows it.
    const fused = reciprocalRankFusion(ids("solo", "both"), ids("other", "both"))
    assert.equal(fused[0].id, "both", `expected agreement to win, got ${JSON.stringify(fused.map((f) => f.id))}`)
  })

  it("scores a document by 1/(k+rank) from each list it appears in", () => {
    const fused = reciprocalRankFusion(ids("x"), ids("x"))
    assert.equal(fused.length, 1)
    assert.equal(fused[0].score, 1 / (RRF_K + 1) + 1 / (RRF_K + 1))
    assert.deepEqual(fused[0].ranks, { lexical: 0, semantic: 0 })
  })

  it("records where each document came from, for debugging a ranking", () => {
    const fused = reciprocalRankFusion(ids("a", "b"), ids("b"))
    const b = fused.find((f) => f.id === "b")!
    assert.deepEqual(b.ranks, { lexical: 1, semantic: 0 })
    const a = fused.find((f) => f.id === "a")!
    assert.deepEqual(a.ranks, { lexical: 0 }, "a document from one list must not claim a rank in the other")
  })

  it("deduplicates: a document in both lists appears once", () => {
    const fused = reciprocalRankFusion(ids("a", "b", "c"), ids("c", "b", "a"))
    assert.equal(fused.length, 3)
    assert.equal(new Set(fused.map((f) => f.id)).size, 3)
  })

  it("is deterministic, including for ties", () => {
    // Mirrored lists give every document an identical score; without
    // a defined tiebreak the order would depend on Map iteration.
    const run = () => reciprocalRankFusion(ids("b", "a"), ids("a", "b")).map((f) => f.id)
    const first = run()
    for (let i = 0; i < 5; i++) assert.deepEqual(run(), first)
    assert.deepEqual(first, ["a", "b"], "ties must break on id, ascending")
  })

  it("k flattens the top of the curve rather than letting rank 1 dominate", () => {
    const withK = reciprocalRankFusion(ids("a", "b"), [], RRF_K)
    const ratioK = withK[0].score / withK[1].score
    const tiny = reciprocalRankFusion(ids("a", "b"), [], 0)
    const ratio0 = tiny[0].score / tiny[1].score
    assert.ok(ratioK < ratio0, "a larger k must compress the gap between adjacent ranks")
    assert.ok(ratioK < 1.05, `rank 1 should not dominate rank 2 (ratio ${ratioK})`)
  })
})

/* ================================================================== *
 * CONTEXT ASSEMBLY — the seam where a retrieval bug becomes a
 * hallucination.
 *
 * Three properties matter and each has a failure that is invisible in
 * the output: overlapping chunks silently duplicating text, a token
 * budget that is exceeded rather than enforced, and a citation marker
 * that points at nothing. Assembly is pure, so all three are provable
 * without a database.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { assembleKnowledgeContext, DEFAULT_CONTEXT_TOKENS } from "@/lib/knowledge/search/context"
import { buildExcerpt, extractCitationIds } from "@/lib/knowledge/search/citations"
import { estimateTokens } from "@/lib/knowledge/chunking"
import type { RetrievedChunk } from "@/lib/knowledge/search/types"

/** The document every offset in this file is a slice of. Using one
 *  real string is what makes the merge assertions meaningful: the
 *  expected text is computed from the source, not typed by hand. */
const DOC =
  "Chunking splits a document into passages. " + // 0..42
  "Overlap keeps a sentence that spans a boundary retrievable. " + // 42..102
  "Embeddings then map each passage into vector space. " + // 102..154
  "Retrieval fuses lexical and semantic candidate lists. " // 154..208

function chunk(over: Partial<RetrievedChunk> & { chunkId: string }): RetrievedChunk {
  const charStart = over.charStart ?? 0
  const charEnd = over.charEnd ?? DOC.length
  return {
    knowledgeItemId: "item-a",
    score: 1,
    title: "Chunking notes",
    source: "example.com",
    snippet: DOC.slice(charStart, charEnd),
    ordinal: 0,
    charStart,
    charEnd,
    metadata: { domain: "example.com", url: "https://example.com/a", lang: "en", publishedAt: null },
    ...over,
  }
}

describe("assembleKnowledgeContext — overlap", () => {
  it("emits the shared text once when adjacent chunks overlap", () => {
    // The exact defect this layer exists to fix: chunking overlaps by
    // ~120 tokens, so two adjacent chunks that both rank would send
    // the shared span twice.
    const a = chunk({ chunkId: "c1", charStart: 0, charEnd: 102, score: 0.9 })
    const b = chunk({ chunkId: "c2", charStart: 42, charEnd: 154, score: 0.8 })

    const ctx = assembleKnowledgeContext({ query: "overlap", chunks: [a, b] })

    assert.equal(ctx.passages.length, 1, "overlapping chunks of one item must merge into one passage")
    assert.equal(ctx.passages[0].text, DOC.slice(0, 154))
    const shared = DOC.slice(42, 102)
    assert.equal(
      ctx.text.split(shared).length - 1,
      1,
      `shared span appeared more than once:\n${ctx.text}`,
    )
  })

  it("keeps both chunk ids on a merged passage", () => {
    const a = chunk({ chunkId: "c1", charStart: 0, charEnd: 102, score: 0.9 })
    const b = chunk({ chunkId: "c2", charStart: 42, charEnd: 154, score: 0.8 })
    const ctx = assembleKnowledgeContext({ query: "overlap", chunks: [a, b] })
    // Losing the second id would break claim → chunk for exactly the
    // passages a reader is most likely to check.
    assert.deepEqual(ctx.passages[0].chunkIds, ["c1", "c2"])
    assert.deepEqual(ctx.citations[0].chunkIds, ["c1", "c2"])
  })

  it("merges chunks that merely touch", () => {
    const a = chunk({ chunkId: "c1", charStart: 0, charEnd: 42 })
    const b = chunk({ chunkId: "c2", charStart: 42, charEnd: 102 })
    const ctx = assembleKnowledgeContext({ query: "touch", chunks: [a, b] })
    assert.equal(ctx.passages.length, 1)
    assert.equal(ctx.passages[0].text, DOC.slice(0, 102))
  })

  it("absorbs a chunk fully contained in another without changing the text", () => {
    const outer = chunk({ chunkId: "outer", charStart: 0, charEnd: 154, score: 0.9 })
    const inner = chunk({ chunkId: "inner", charStart: 42, charEnd: 102, score: 0.5 })
    const ctx = assembleKnowledgeContext({ query: "contained", chunks: [outer, inner] })
    assert.equal(ctx.passages.length, 1)
    assert.equal(ctx.passages[0].text, DOC.slice(0, 154))
    assert.deepEqual(ctx.passages[0].chunkIds, ["outer", "inner"])
  })

  it("does NOT merge non-adjacent chunks of the same item", () => {
    // A gap means the model would read two separate excerpts as one
    // continuous argument. Splicing them is a fabrication.
    const a = chunk({ chunkId: "c1", charStart: 0, charEnd: 42, score: 0.9 })
    const b = chunk({ chunkId: "c2", charStart: 154, charEnd: 208, score: 0.8 })
    const ctx = assembleKnowledgeContext({ query: "gap", chunks: [a, b] })
    assert.equal(ctx.passages.length, 2)
    assert.equal(ctx.passages[0].text, DOC.slice(0, 42))
    assert.equal(ctx.passages[1].text, DOC.slice(154, 208))
  })

  it("never merges across items even at identical offsets", () => {
    const a = chunk({ chunkId: "c1", charStart: 0, charEnd: 102 })
    const b = chunk({ chunkId: "c2", knowledgeItemId: "item-b", charStart: 42, charEnd: 154 })
    const ctx = assembleKnowledgeContext({ query: "cross", chunks: [a, b] })
    assert.equal(ctx.passages.length, 2)
    assert.equal(ctx.citations.length, 2)
  })

  it("leaves chunks without offsets standalone rather than guessing", () => {
    const a = chunk({ chunkId: "c1", charStart: 0, charEnd: 102, score: 0.9 })
    const loose = { ...chunk({ chunkId: "c2", score: 0.8 }), charStart: null, charEnd: null }
    const ctx = assembleKnowledgeContext({ query: "loose", chunks: [a, loose] })
    assert.equal(ctx.passages.length, 2)
    assert.equal(ctx.passages.find((p) => p.chunkIds.includes("c2"))!.charStart, null)
  })
})

describe("assembleKnowledgeContext — budget", () => {
  it("never exceeds the requested budget", () => {
    const chunks = Array.from({ length: 40 }, (_, i) =>
      chunk({ chunkId: `c${i}`, knowledgeItemId: `item-${i}`, score: 1 - i / 100 }),
    )
    const ctx = assembleKnowledgeContext({ query: "budget", chunks, maxTokens: 200 })
    assert.ok(ctx.usedTokens <= 200, `used ${ctx.usedTokens} of 200`)
    assert.ok(ctx.passages.length > 0, "a 200-token budget should still fit something")
    assert.equal(ctx.budgetTokens, 200)
  })

  it("counts the rendered header, not just the passage text", () => {
    const c = chunk({ chunkId: "c1" })
    const ctx = assembleKnowledgeContext({ query: "header", chunks: [c] })
    assert.ok(
      ctx.usedTokens > estimateTokens(c.snippet),
      "a budget that ignores its own formatting is not a budget",
    )
  })

  it("reports every chunk it could not fit", () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      chunk({ chunkId: `c${i}`, knowledgeItemId: `item-${i}`, score: 1 - i / 100 }),
    )
    const ctx = assembleKnowledgeContext({ query: "dropped", chunks, maxTokens: 120 })
    const included = ctx.passages.reduce((n, p) => n + p.chunkIds.length, 0)
    assert.equal(ctx.droppedChunks, 20 - included)
    assert.ok(ctx.droppedChunks > 0)
  })

  it("skips an oversized passage but keeps taking smaller ones", () => {
    // Stopping at the first passage that does not fit would silently
    // narrow the answer to whatever happened to rank first.
    const huge = {
      ...chunk({ chunkId: "huge", score: 0.99 }),
      snippet: "word ".repeat(4000),
      charStart: null,
      charEnd: null,
    }
    const small = chunk({ chunkId: "small", knowledgeItemId: "item-b", score: 0.5 })
    const ctx = assembleKnowledgeContext({ query: "skip", chunks: [huge, small], maxTokens: 300 })
    assert.deepEqual(ctx.passages.map((p) => p.chunkIds[0]), ["small"])
    assert.equal(ctx.droppedChunks, 1)
  })

  it("returns an empty context, not a throw, when nothing was retrieved", () => {
    const ctx = assembleKnowledgeContext({ query: "nothing", chunks: [] })
    assert.equal(ctx.text, "")
    assert.deepEqual(ctx.citations, [])
    assert.equal(ctx.droppedChunks, 0)
    assert.equal(ctx.budgetTokens, DEFAULT_CONTEXT_TOKENS)
  })

  it("ignores blank chunks entirely", () => {
    const blank = { ...chunk({ chunkId: "blank" }), snippet: "   \n  " }
    const ctx = assembleKnowledgeContext({ query: "blank", chunks: [blank] })
    assert.equal(ctx.passages.length, 0)
    assert.equal(ctx.droppedChunks, 0)
  })
})

describe("assembleKnowledgeContext — citations", () => {
  it("numbers citations from 1 in the order passages appear", () => {
    const a = chunk({ chunkId: "c1", knowledgeItemId: "item-a", score: 0.4 })
    const b = chunk({ chunkId: "c2", knowledgeItemId: "item-b", score: 0.9 })
    const ctx = assembleKnowledgeContext({ query: "order", chunks: [a, b] })
    assert.deepEqual(ctx.citations.map((c) => c.citationId), ["1", "2"])
    assert.equal(ctx.citations[0].knowledgeItemId, "item-b", "best evidence is cited first")
    assert.ok(ctx.text.startsWith("[1] "))
  })

  it("gives one item a single citation across several passages", () => {
    const a = chunk({ chunkId: "c1", charStart: 0, charEnd: 42, score: 0.9 })
    const b = chunk({ chunkId: "c2", charStart: 154, charEnd: 208, score: 0.8 })
    const ctx = assembleKnowledgeContext({ query: "same item", chunks: [a, b] })
    assert.equal(ctx.citations.length, 1)
    assert.deepEqual(ctx.passages.map((p) => p.citationId), ["1", "1"])
    assert.deepEqual(ctx.citations[0].chunkIds, ["c1", "c2"])
  })

  it("every marker in the assembled text resolves to a citation", () => {
    const chunks = [
      chunk({ chunkId: "c1", knowledgeItemId: "item-a", score: 0.9 }),
      chunk({ chunkId: "c2", knowledgeItemId: "item-b", score: 0.8 }),
      chunk({ chunkId: "c3", knowledgeItemId: "item-c", score: 0.7 }),
    ]
    const ctx = assembleKnowledgeContext({ query: "markers", chunks })
    const used = extractCitationIds(ctx.text)
    const known = new Set(ctx.citations.map((c) => c.citationId))
    assert.deepEqual(used, ["1", "2", "3"])
    for (const id of used) assert.ok(known.has(id), `marker [${id}] resolves to nothing`)
  })

  it("never emits a citation for a passage the budget dropped", () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      chunk({ chunkId: `c${i}`, knowledgeItemId: `item-${i}`, score: 1 - i / 100 }),
    )
    const ctx = assembleKnowledgeContext({ query: "dropped citations", chunks, maxTokens: 150 })
    const cited = new Set(ctx.citations.map((c) => c.knowledgeItemId))
    const present = new Set(ctx.passages.map((p) => p.knowledgeItemId))
    assert.deepEqual([...cited].sort(), [...present].sort())
  })

  it("falls back to the URL when an item has no title", () => {
    const c = { ...chunk({ chunkId: "c1" }), title: null }
    const ctx = assembleKnowledgeContext({ query: "untitled", chunks: [c] })
    assert.equal(ctx.citations[0].title, "https://example.com/a")
  })

  it("carries the source url and the best chunk id on the citation", () => {
    const a = chunk({ chunkId: "low", charStart: 0, charEnd: 102, score: 0.2 })
    const b = chunk({ chunkId: "high", charStart: 42, charEnd: 154, score: 0.95 })
    const ctx = assembleKnowledgeContext({ query: "best", chunks: [a, b] })
    assert.equal(ctx.citations[0].chunkId, "high")
    assert.equal(ctx.citations[0].sourceUrl, "https://example.com/a")
    assert.equal(ctx.citations[0].relevanceScore, 0.95)
  })

  it("is deterministic for the same candidates in any input order", () => {
    const chunks = [
      chunk({ chunkId: "a", knowledgeItemId: "item-a", score: 0.5 }),
      chunk({ chunkId: "b", knowledgeItemId: "item-b", score: 0.5 }),
      chunk({ chunkId: "c", knowledgeItemId: "item-c", score: 0.5 }),
    ]
    const forward = assembleKnowledgeContext({ query: "determinism", chunks })
    const reversed = assembleKnowledgeContext({ query: "determinism", chunks: [...chunks].reverse() })
    assert.equal(forward.text, reversed.text, "a prompt that varies run to run cannot be debugged")
  })
})

describe("citation helpers", () => {
  it("shortens an excerpt on a word boundary", () => {
    const excerpt = buildExcerpt(DOC, 60)
    assert.ok(excerpt.endsWith("…"))
    assert.ok(excerpt.length <= 61)
    assert.ok(!excerpt.slice(0, -1).endsWith(" "))
  })

  it("leaves a short excerpt untouched and collapses whitespace", () => {
    assert.equal(buildExcerpt("  a\n\n b  "), "a b")
  })

  it("extracts markers once, in order of first appearance", () => {
    assert.deepEqual(extractCitationIds("Yes [2] and also [1], again [2]."), ["2", "1"])
  })

  it("finds no markers in text that has none", () => {
    assert.deepEqual(extractCitationIds("No sources were used."), [])
  })
})

/* ================================================================== *
 * CHUNKING — the offsets are the contract.
 *
 * Everything downstream trusts one thing about this module:
 *
 *     content.slice(charStart, charEnd) === text
 *
 * A citation points at a span of the source, and the Reader
 * highlights that span in text it renders itself. If an offset is off
 * by one, nothing throws — a citation quietly highlights the wrong
 * sentence, and no other test in the system would notice. So that
 * invariant is asserted on EVERY chunk of EVERY fixture here, through
 * one helper, rather than spot-checked.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { chunkContent, estimateTokens, DEFAULT_CHUNK_OPTIONS, type Chunk } from "@/lib/knowledge/chunking"

/** Asserts the whole contract for a set of chunks over one source. */
function assertWellFormed(content: string, chunks: Chunk[], label: string) {
  chunks.forEach((chunk, i) => {
    assert.equal(chunk.ordinal, i, `${label}: ordinals must be 0..n-1 in order`)
    assert.equal(
      content.slice(chunk.charStart, chunk.charEnd),
      chunk.text,
      `${label}: chunk ${i} text must be exactly the slice its offsets name`,
    )
    assert.ok(chunk.charStart >= 0 && chunk.charEnd <= content.length, `${label}: chunk ${i} offsets in range`)
    assert.ok(chunk.charEnd > chunk.charStart, `${label}: chunk ${i} must be a non-empty span`)
    assert.equal(chunk.tokenEstimate, estimateTokens(chunk.text), `${label}: chunk ${i} estimate must match its text`)
  })
  // Coverage: every character of the source belongs to some chunk.
  // Overlap means spans repeat, but nothing may fall between them.
  if (chunks.length > 0) {
    assert.equal(chunks[0].charStart, 0, `${label}: must start at the beginning`)
    assert.equal(chunks[chunks.length - 1].charEnd, content.length, `${label}: must reach the end`)
    for (let i = 1; i < chunks.length; i++) {
      assert.ok(
        chunks[i].charStart <= chunks[i - 1].charEnd,
        `${label}: gap between chunk ${i - 1} and ${i} — source text would be unreachable`,
      )
      assert.ok(chunks[i].charStart > chunks[i - 1].charStart, `${label}: chunk ${i} must make progress`)
    }
  }
}

const para = (n: number, word = "sentence") =>
  Array.from({ length: n }, (_, i) => `This is ${word} number ${i} and it carries enough words to be a real clause.`).join(" ")

describe("nothing to chunk", () => {
  it("empty content yields no chunks", () => {
    assert.deepEqual(chunkContent(""), [])
  })

  it("whitespace-only content yields no chunks", () => {
    // An empty chunk in the index is worse than no chunk: the
    // retriever would find it and cite nothing.
    for (const blank of [" ", "\n", "\t", "   \n\n  \t \n", " "]) {
      assert.deepEqual(chunkContent(blank), [], `"${JSON.stringify(blank)}" must produce nothing`)
    }
  })
})

describe("content that fits in one chunk", () => {
  it("short content is one chunk spanning the whole document", () => {
    const content = "A single short paragraph about retrieval."
    const chunks = chunkContent(content)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].charStart, 0)
    assert.equal(chunks[0].charEnd, content.length)
    assert.equal(chunks[0].text, content)
    assertWellFormed(content, chunks, "short")
  })

  it("one paragraph under the target is not split", () => {
    const content = para(20)
    assert.ok(content.length < DEFAULT_CHUNK_OPTIONS.targetTokens * 4)
    assert.equal(chunkContent(content).length, 1)
  })

  it("leading and trailing whitespace is preserved, not trimmed away", () => {
    // Trimming without moving offsets is exactly how citations start
    // pointing at the wrong words.
    const content = "\n\n  Real text here.  \n\n"
    const chunks = chunkContent(content)
    assert.equal(chunks[0].text, content)
    assertWellFormed(content, chunks, "untrimmed")
  })
})

describe("long content splits on meaningful boundaries", () => {
  const paragraphs = Array.from({ length: 12 }, (_, i) => para(12, `topic${i}`)).join("\n\n")

  it("produces several chunks and every one is well formed", () => {
    const chunks = chunkContent(paragraphs)
    assert.ok(chunks.length > 1, `expected a split, got ${chunks.length}`)
    assertWellFormed(paragraphs, chunks, "paragraphs")
  })

  it("prefers paragraph breaks: most chunks end at a blank line", () => {
    const chunks = chunkContent(paragraphs)
    const endsOnParagraph = chunks.slice(0, -1).filter((c) => /\n[ \t]*\n$/.test(c.text)).length
    assert.ok(
      endsOnParagraph >= chunks.length - 2,
      `expected paragraph boundaries, only ${endsOnParagraph} of ${chunks.length - 1} interior chunks ended on one`,
    )
  })

  it("falls back to sentence boundaries when there are no paragraphs", () => {
    const oneBlock = para(400)
    assert.ok(!oneBlock.includes("\n\n"))
    const chunks = chunkContent(oneBlock)
    assert.ok(chunks.length > 1)
    assertWellFormed(oneBlock, chunks, "sentences")
    const endsOnSentence = chunks.slice(0, -1).filter((c) => /[.!?…]["')\]]?\s$/.test(c.text)).length
    assert.ok(endsOnSentence > 0, "no chunk ended on a sentence boundary")
  })

  it("falls back to whitespace when there is no sentence punctuation", () => {
    const noPunctuation = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ")
    const chunks = chunkContent(noPunctuation)
    assert.ok(chunks.length > 1)
    assertWellFormed(noPunctuation, chunks, "whitespace")
    for (const c of chunks.slice(0, -1)) {
      assert.match(c.text, /\s$/, "a whitespace-boundary chunk should end at a word break")
    }
  })

  it("hard-cuts an unbroken run rather than emitting one unbounded chunk", () => {
    // A minified script or a base64 blob: no paragraph, no sentence,
    // no space anywhere.
    const blob = "a".repeat(20_000)
    const chunks = chunkContent(blob)
    assert.ok(chunks.length > 1, "an unbroken run must still be split")
    assertWellFormed(blob, chunks, "hard cut")
    for (const c of chunks) {
      assert.ok(c.text.length <= DEFAULT_CHUNK_OPTIONS.targetTokens * 4 + 1, "hard cut must respect the target")
    }
  })
})

describe("no pathological chunks", () => {
  it("a short tail is merged into the previous chunk rather than emitted alone", () => {
    // Target is 3600 chars; build something just past it so a naive
    // splitter would leave a stub.
    const content = para(60) + " " + "x".repeat(20)
    const chunks = chunkContent(content)
    const min = DEFAULT_CHUNK_OPTIONS.minTokens * 4
    for (const c of chunks) {
      assert.ok(c.text.length >= min || chunks.length === 1, `chunk ${c.ordinal} is a ${c.text.length}-char stub`)
    }
    assertWellFormed(content, chunks, "tail merge")
  })
})

describe("overlap", () => {
  it("consecutive chunks share text, so a claim spanning a boundary survives whole", () => {
    const content = para(400)
    const chunks = chunkContent(content)
    assert.ok(chunks.length > 1)
    for (let i = 1; i < chunks.length; i++) {
      const overlap = chunks[i - 1].charEnd - chunks[i].charStart
      assert.ok(overlap > 0, `chunks ${i - 1} and ${i} do not overlap`)
    }
  })

  it("overlap does not stop forward progress", () => {
    // The failure this guards is an infinite loop, not a wrong answer.
    const content = para(2000)
    const chunks = chunkContent(content)
    assert.ok(chunks.length > 3)
    assertWellFormed(content, chunks, "progress")
  })
})

describe("Unicode safety", () => {
  it("never splits a surrogate pair", () => {
    // Emoji are two UTF-16 code units; a hard cut landing between
    // them produces a lone surrogate — invalid text that will not
    // round-trip through the database or a provider.
    const content = "😀".repeat(10_000)
    const chunks = chunkContent(content)
    assert.ok(chunks.length > 1)
    assertWellFormed(content, chunks, "emoji")
    for (const c of chunks) {
      assert.ok(!/[\uD800-\uDBFF]$/.test(c.text), `chunk ${c.ordinal} ends on a lone high surrogate`)
      assert.ok(!/^[\uDC00-\uDFFF]/.test(c.text), `chunk ${c.ordinal} starts on a lone low surrogate`)
    }
  })

  it("never strands a combining mark from its base character", () => {
    const content = "é".repeat(10_000) // é as e + combining acute
    const chunks = chunkContent(content)
    assertWellFormed(content, chunks, "combining")
    for (const c of chunks) {
      assert.ok(!/^\p{M}/u.test(c.text), `chunk ${c.ordinal} starts with an orphaned combining mark`)
    }
  })

  it("handles non-Latin scripts and mixed punctuation", () => {
    const mixed = ("这是一个测试。これはテストです。Это тест — да! ¿Y esto? ").repeat(400)
    const chunks = chunkContent(mixed)
    assert.ok(chunks.length > 1)
    assertWellFormed(mixed, chunks, "mixed scripts")
  })
})

describe("determinism", () => {
  const fixtures = [
    "short",
    para(30),
    Array.from({ length: 10 }, (_, i) => para(15, `t${i}`)).join("\n\n"),
    "😀".repeat(5_000),
    "a".repeat(12_000),
  ]

  it("repeated chunking of identical content is byte-identical", () => {
    // This is what makes re-indexing a no-op rather than churn.
    for (const [i, content] of fixtures.entries()) {
      const first = chunkContent(content)
      for (let run = 0; run < 3; run++) {
        assert.deepEqual(chunkContent(content), first, `fixture ${i} differed on run ${run + 1}`)
      }
    }
  })

  it("carries no hidden state between calls", () => {
    const a = chunkContent(fixtures[2])
    chunkContent(fixtures[4])
    chunkContent(fixtures[3])
    assert.deepEqual(chunkContent(fixtures[2]), a, "an unrelated call changed the result")
  })
})

describe("token estimation is a documented approximation", () => {
  it("is deterministic and proportional to length", () => {
    assert.equal(estimateTokens(""), 0)
    assert.equal(estimateTokens("abcd"), 1)
    assert.equal(estimateTokens("a".repeat(4000)), 1000)
  })

  it("never reports zero for non-empty text", () => {
    // A zero would let a chunk look free to a context budget.
    assert.equal(estimateTokens("a"), 1)
  })
})

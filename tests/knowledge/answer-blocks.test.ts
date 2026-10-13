/* ================================================================== *
 * THE ANSWER'S OWN STRUCTURE — blocksOf / inlineOf.
 *
 * Two things are being protected here and they pull in opposite
 * directions, which is why this file exists rather than a few cases
 * bolted onto ai-contract.test.ts:
 *
 *   1. STRUCTURE IS RENDERED. A bulleted list the model wrote is a
 *      list, not three lines beginning with a hyphen. Everything the
 *      grammar claims to understand is exercised against real shapes
 *      a model emits, including the awkward ones (a wrapped bullet, a
 *      fence nobody closed, a list that changes marker mid-way).
 *
 *   2. THE TEXT STILL CANNOT DRAW ITS OWN UI. The block list is DATA
 *      over a closed set of kinds. No case below may produce a kind
 *      outside that set, and no amount of formatting may promote an
 *      invented [n] into a citation — the grounding rule stays
 *      tokenizeAnswer's, and these tests assert that from the outside.
 *
 * Several of the assertions are here because the naive version of this
 * grammar got them wrong. "2 * 3 * 4" italicised " 3 ", and
 * `chunk_id_hash` lost its middle to underscore emphasis — which is
 * why underscores are not emphasis at all. Both are pinned below.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { blocksOf, inlineOf, paragraphsOf, type AnswerBlock, type AnswerInline } from "@/lib/knowledge/ai"

const IDS = ["1", "2"]

/** The kinds the renderer has an element for. A block outside this set
 *  would reach ./answer-body.tsx and fall through its switch. */
const BLOCK_KINDS = new Set(["paragraph", "heading", "list", "quote", "code"])
const INLINE_KINDS = new Set(["text", "citation", "unresolved", "strong", "emphasis", "code"])

function inlineOfBlock(block: AnswerBlock): AnswerInline[] {
  if (block.type === "list") return block.items.flat()
  if (block.type === "code") return []
  return block.inline
}

/** Everything the grammar can ever emit, checked against the closed
 *  sets above. Called from every case so no test can introduce a kind
 *  by accident. */
function assertClosed(blocks: AnswerBlock[]): void {
  for (const block of blocks) {
    assert.ok(BLOCK_KINDS.has(block.type), `unknown block kind: ${block.type}`)
    for (const token of inlineOfBlock(block)) {
      assert.ok(INLINE_KINDS.has(token.type), `unknown inline kind: ${token.type}`)
    }
  }
}

function parse(text: string, ids: string[] = IDS): AnswerBlock[] {
  const blocks = blocksOf(text, ids)
  assertClosed(blocks)
  return blocks
}

/** The visible characters, ignoring which element they landed in. Used
 *  to assert that nothing is silently dropped. */
function textOf(blocks: AnswerBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "code") return block.code
      return inlineOfBlock(block)
        .map((t) =>
          t.type === "citation" || t.type === "unresolved" ? `[${t.citationId}]` : t.value,
        )
        .join("")
    })
    .join("\n")
}

describe("blocksOf — plain prose", () => {
  it("produces one paragraph per blank-line-separated block, as paragraphsOf always did", () => {
    const text = "First claim [1].\n\nSecond claim [2]."
    const blocks = parse(text)
    assert.equal(blocks.length, 2)
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["paragraph", "paragraph"],
    )
    // The paragraph rule did not change when it gained siblings.
    assert.equal(paragraphsOf(text, IDS).length, blocks.length)
  })

  it("joins a soft-wrapped paragraph with a space, matching how it already rendered", () => {
    const blocks = parse("A claim that was\nwrapped by the model [1].")
    assert.equal(blocks.length, 1)
    assert.equal(textOf(blocks), "A claim that was wrapped by the model [1].")
  })

  it("returns no blocks for empty or whitespace-only text", () => {
    assert.deepEqual(parse(""), [])
    assert.deepEqual(parse("   \n\n  \t "), [])
  })

  it("keeps the citation rule: a known marker links, an invented one does not", () => {
    const blocks = parse("Known [1] and invented [9].")
    const kinds = inlineOfBlock(blocks[0]).map((t) => t.type)
    assert.ok(kinds.includes("citation"))
    assert.ok(kinds.includes("unresolved"))
    const unresolved = inlineOfBlock(blocks[0]).find((t) => t.type === "unresolved")
    assert.deepEqual(unresolved, { type: "unresolved", citationId: "9" })
  })
})

describe("blocksOf — lists", () => {
  it("reads a hyphen bullet list as one list of items", () => {
    const blocks = parse("Findings:\n\n- First [1]\n- Second [2]\n- Third")
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["paragraph", "list"],
    )
    const list = blocks[1]
    assert.equal(list.type, "list")
    if (list.type !== "list") return
    assert.equal(list.ordered, false)
    assert.equal(list.items.length, 3)
  })

  it("reads an asterisk bullet and a bullet-character bullet the same way", () => {
    for (const marker of ["*", "•"]) {
      const list = parse(`${marker} One\n${marker} Two`)[0]
      assert.equal(list.type, "list")
      if (list.type !== "list") return
      assert.equal(list.ordered, false)
      assert.equal(list.items.length, 2)
    }
  })

  it("reads 1. and 1) as an ordered list", () => {
    for (const text of ["1. One\n2. Two", "1) One\n2) Two"]) {
      const list = parse(text)[0]
      assert.equal(list.type, "list")
      if (list.type !== "list") return
      assert.equal(list.ordered, true)
      assert.equal(list.items.length, 2)
    }
  })

  it("splits into two lists when the marker kind changes, so an ordered item is never renumbered inside a bulleted list", () => {
    const blocks = parse("- One\n- Two\n1. Step one\n2. Step two")
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["list", "list"],
    )
    const [bulleted, numbered] = blocks
    if (bulleted.type !== "list" || numbered.type !== "list") return assert.fail("expected two lists")
    assert.equal(bulleted.ordered, false)
    assert.equal(numbered.ordered, true)
    assert.equal(bulleted.items.length, 2)
    assert.equal(numbered.items.length, 2)
  })

  it("continues a wrapped bullet onto its own item rather than starting a paragraph", () => {
    const blocks = parse("- A bullet the model\n  wrapped over two lines\n- Another")
    assert.equal(blocks.length, 1)
    const list = blocks[0]
    if (list.type !== "list") return assert.fail("expected a list")
    assert.equal(list.items.length, 2)
    assert.equal(
      list.items[0].map((t) => ("value" in t ? t.value : "")).join(""),
      "A bullet the model wrapped over two lines",
    )
  })

  it("ends the list at a blank line", () => {
    const blocks = parse("- One\n- Two\n\nA closing sentence.")
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["list", "paragraph"],
    )
  })

  it("tokenizes citations inside list items", () => {
    const list = parse("- Supported [1]\n- Invented [9]")[0]
    if (list.type !== "list") return assert.fail("expected a list")
    assert.ok(list.items[0].some((t) => t.type === "citation"))
    assert.ok(list.items[1].some((t) => t.type === "unresolved"))
  })

  it("drops a marker with no content rather than rendering an empty bullet", () => {
    const blocks = parse("-   \n-   ")
    assert.deepEqual(blocks, [])
  })
})

describe("blocksOf — headings and quotes", () => {
  it("maps # through ### to level 3 and deeper to level 4, never to h1 or h2", () => {
    for (const [hashes, level] of [["#", 3], ["##", 3], ["###", 3], ["####", 4], ["######", 4]] as const) {
      const block = parse(`${hashes} A heading`)[0]
      assert.equal(block.type, "heading")
      if (block.type !== "heading") return
      assert.equal(block.level, level)
    }
  })

  it("does not treat a hash without a following space as a heading", () => {
    const block = parse("#hashtag is not a heading")[0]
    assert.equal(block.type, "paragraph")
  })

  it("reads > as a quote and joins its consecutive lines", () => {
    const blocks = parse("> quoted first\n> quoted second")
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].type, "quote")
    assert.equal(textOf(blocks), "quoted first quoted second")
  })

  it("closes a quote when prose resumes", () => {
    const blocks = parse("> a quote\nback to prose")
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["quote", "paragraph"],
    )
  })
})

describe("blocksOf — code", () => {
  it("reads a fenced block verbatim, keeping its newlines and its language label", () => {
    const blocks = parse("```ts\nconst a = 1\nconst b = 2\n```")
    assert.equal(blocks.length, 1)
    const code = blocks[0]
    assert.equal(code.type, "code")
    if (code.type !== "code") return
    assert.equal(code.language, "ts")
    assert.equal(code.code, "const a = 1\nconst b = 2")
  })

  it("reports no language when the fence named none", () => {
    const code = parse("```\nplain\n```")[0]
    if (code.type !== "code") return assert.fail("expected a code block")
    assert.equal(code.language, null)
  })

  it("accepts a tilde fence", () => {
    const code = parse("~~~py\nx = 1\n~~~")[0]
    assert.equal(code.type, "code")
    if (code.type !== "code") return
    assert.equal(code.language, "py")
  })

  it("does NOT tokenize citations inside code — a marker there is part of the sample", () => {
    const code = parse("```\nconst refs = arr[1]\n```")[0]
    if (code.type !== "code") return assert.fail("expected a code block")
    assert.equal(code.code, "const refs = arr[1]")
    // The code block carries no inline tokens at all, so there is no
    // path by which a sample could contribute a link.
    assert.deepEqual(inlineOfBlock(code), [])
  })

  it("runs an unclosed fence to the end rather than discarding the rest of the answer", () => {
    const blocks = parse("Intro.\n\n```ts\nconst a = 1\nstill inside")
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["paragraph", "code"],
    )
    const code = blocks[1]
    if (code.type !== "code") return
    assert.equal(code.code, "const a = 1\nstill inside")
  })

  it("flushes an open paragraph and list before the fence", () => {
    const blocks = parse("Prose.\n- A bullet\n```\ncode\n```")
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["paragraph", "list", "code"],
    )
  })

  it("emits nothing for an empty fence rather than an empty block", () => {
    assert.deepEqual(parse("```\n```"), [])
  })
})

describe("inlineOf — marks", () => {
  const marksOf = (text: string) => inlineOf(text, IDS)

  it("reads **bold**, *italic* and `code`", () => {
    assert.deepEqual(marksOf("a **b** c"), [
      { type: "text", value: "a " },
      { type: "strong", value: "b" },
      { type: "text", value: " c" },
    ])
    assert.deepEqual(marksOf("a *b* c"), [
      { type: "text", value: "a " },
      { type: "emphasis", value: "b" },
      { type: "text", value: " c" },
    ])
    assert.deepEqual(marksOf("a `b` c"), [
      { type: "text", value: "a " },
      { type: "code", value: "b" },
      { type: "text", value: " c" },
    ])
  })

  it("prefers ** over * so bold is never read as two italics", () => {
    const tokens = marksOf("**bold**")
    assert.deepEqual(tokens, [{ type: "strong", value: "bold" }])
  })

  it("does not italicise an arithmetic asterisk — '2 * 3 * 4' is prose", () => {
    assert.deepEqual(marksOf("2 * 3 * 4"), [{ type: "text", value: "2 * 3 * 4" }])
  })

  it("does not italicise snake_case: underscores are not emphasis", () => {
    assert.deepEqual(marksOf("the chunk_id_hash column"), [
      { type: "text", value: "the chunk_id_hash column" },
    ])
    assert.deepEqual(marksOf("__not bold__"), [{ type: "text", value: "__not bold__" }])
  })

  it("leaves an unpaired marker verbatim", () => {
    for (const text of ["an * orphan", "a ** orphan", "an `orphan"]) {
      assert.deepEqual(marksOf(text), [{ type: "text", value: text }])
    }
  })

  it("does not let a mark cross a line", () => {
    assert.deepEqual(marksOf("*start\nend*"), [{ type: "text", value: "*start\nend*" }])
  })

  it("classifies a marker inside bold as a citation before any formatting is considered", () => {
    // The ** is unpaired once the marker is cut out, so it stays text —
    // and the point is that [1] is still the API's citation and [9] is
    // still unresolved. Formatting cannot change either verdict.
    const tokens = marksOf("**known [1]** and **invented [9]**")
    assert.ok(tokens.some((t) => t.type === "citation" && t.citationId === "1"))
    assert.ok(tokens.some((t) => t.type === "unresolved" && t.citationId === "9"))
    assert.ok(!tokens.some((t) => t.type === "citation" && t.citationId === "9"))
  })

  it("never emits a kind outside the closed inline set", () => {
    for (const text of ["**a** *b* `c` [1] [9] plain", "`a` **b**", "*only*"]) {
      for (const token of marksOf(text)) {
        assert.ok(INLINE_KINDS.has(token.type))
      }
    }
  })
})

describe("blocksOf — nothing is silently lost", () => {
  it("keeps every visible character of a mixed answer", () => {
    const text = [
      "## Findings",
      "",
      "Two things stand out [1]:",
      "",
      "- The first, with a `flag` set",
      "- The second [2]",
      "",
      "> as the source puts it",
      "",
      "```ts",
      "const ok = true",
      "```",
      "",
      "That is all.",
    ].join("\n")

    const blocks = parse(text)
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["heading", "paragraph", "list", "quote", "code", "paragraph"],
    )

    // Every word of the answer survives somewhere in the output.
    const rendered = textOf(blocks)
    for (const word of ["Findings", "stand out", "[1]", "flag", "[2]", "as the source puts it", "const ok = true", "That is all."]) {
      assert.ok(rendered.includes(word), `lost: ${word}`)
    }
  })

  it("is a pure function of its inputs", () => {
    const text = "- a\n- b\n\nprose [1]"
    assert.deepEqual(blocksOf(text, IDS), blocksOf(text, IDS))
  })
})

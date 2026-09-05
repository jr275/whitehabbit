/* ================================================================== *
 * THE WIRE CONTRACT — the browser's last line of defence.
 *
 * The UI's one job is to render only what the backend reported. That
 * holds if, and only if, what arrives is really what the backend
 * reports — and "the server returns this shape" is an assumption until
 * something checks it. A proxy rewriting the body, a deployment
 * mid-rollout, or an error page served with a 200 all arrive as JSON
 * that TypeScript happily believes.
 *
 * So these tests are mostly about refusing input. A half-parsed answer
 * rendered as grounded is the exact failure this product exists to
 * prevent.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  classifyAnswer,
  isFullyGrounded,
  MalformedAnswerError,
  parseKnowledgeAnswer,
  type KnowledgeAnswer,
} from "@/lib/knowledge/ai"

const VALID: KnowledgeAnswer = {
  status: "answered",
  question: "why do chunking projects fail?",
  answer: "Chunking is usually the culprit [1].",
  citations: [
    {
      citationId: "1",
      knowledgeItemId: "kn_abc",
      chunkId: "knc_1",
      chunkIds: ["knc_1", "knc_2"],
      title: "On chunking",
      sourceUrl: "https://example.test/a",
      excerpt: "Most retrieval failures are chunking failures.",
      relevanceScore: 0.9,
      used: true,
    },
  ],
  unresolvedCitationIds: [],
  retrieval: {
    mode: "hybrid",
    executed: { lexical: true, semantic: true },
    semanticSearch: { enabled: true },
    candidates: { lexical: 3, semantic: 4 },
    chunksRetrieved: 4,
    chunksRejected: 1,
    chunksUsed: 3,
    droppedChunks: 0,
    contextTokens: 812,
  },
  timings: { retrievalMs: 12, generationMs: 400, totalMs: 415 },
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v))

describe("parseKnowledgeAnswer — accepts what the server really sends", () => {
  it("round-trips a full response", () => {
    const parsed = parseKnowledgeAnswer(json(VALID))
    assert.deepEqual(parsed, VALID)
  })

  it("accepts the refusal shape, which carries no usage", () => {
    const refusal = json({ ...VALID, status: "no_evidence", answer: "Nothing covers this.", citations: [] })
    const parsed = parseKnowledgeAnswer(refusal)
    assert.equal(parsed.status, "no_evidence")
    assert.equal(parsed.usage, undefined)
  })

  it("accepts usage when present and keeps the real numbers", () => {
    const withUsage = json({
      ...VALID,
      usage: { provider: "anthropic", model: "m", inputTokens: 900, outputTokens: 40 },
    })
    assert.equal(parseKnowledgeAnswer(withUsage).usage?.inputTokens, 900)
  })

  it("ignores fields it does not know about, so the server can add one", () => {
    const parsed = parseKnowledgeAnswer(json({ ...VALID, futureField: { nested: true } }))
    assert.equal(parsed.status, "answered")
  })

  it("keeps optional citation fields absent rather than filling them in", () => {
    const minimal = json({
      ...VALID,
      citations: [{ citationId: "1", knowledgeItemId: "kn_abc", chunkIds: ["knc_1"], title: "T", used: true }],
    })
    const c = parseKnowledgeAnswer(minimal).citations[0]
    assert.equal(c.excerpt, undefined, "a missing excerpt must not become an empty string")
    assert.equal(c.sourceUrl, undefined)
    assert.equal(c.relevanceScore, undefined)
  })
})

describe("parseKnowledgeAnswer — refuses everything else", () => {
  const cases: [string, unknown][] = [
    ["a non-object body", "an error page"],
    ["null", null],
    ["an unknown status", { ...VALID, status: "maybe" }],
    ["a missing answer", { ...VALID, answer: undefined }],
    ["an answered response with empty text", { ...VALID, answer: "   " }],
    ["citations that are not an array", { ...VALID, citations: {} }],
    ["a citation without an item id", { ...VALID, citations: [{ citationId: "1", title: "T", chunkIds: [], used: true }] }],
    ["a citation without chunk ids", { ...VALID, citations: [{ citationId: "1", knowledgeItemId: "k", title: "T", used: true }] }],
    ["a citation whose used flag is a string", { ...VALID, citations: [{ ...VALID.citations[0], used: "yes" }] }],
    ["unresolved ids that are not strings", { ...VALID, unresolvedCitationIds: [7] }],
    ["a missing retrieval report", { ...VALID, retrieval: undefined }],
    ["an unknown retrieval mode", { ...VALID, retrieval: { ...VALID.retrieval, mode: "magic" } }],
    ["a retrieval count that is a string", { ...VALID, retrieval: { ...VALID.retrieval, chunksUsed: "3" } }],
    ["a missing semanticSearch status", { ...VALID, retrieval: { ...VALID.retrieval, semanticSearch: undefined } }],
    ["a semanticSearch status that is a bare boolean", { ...VALID, retrieval: { ...VALID.retrieval, semanticSearch: false } }],
    ["a disabled semanticSearch with no reason", { ...VALID, retrieval: { ...VALID.retrieval, semanticSearch: { enabled: false } } }],
    ["a semanticSearch reason the UI cannot render", { ...VALID, retrieval: { ...VALID.retrieval, semanticSearch: { enabled: false, reason: "vibes" } } }],
    ["a partial usage object", { ...VALID, usage: { provider: "anthropic" } }],
    ["missing timings", { ...VALID, timings: undefined }],
  ]

  for (const [label, body] of cases) {
    it(`rejects ${label}`, () => {
      assert.throws(() => parseKnowledgeAnswer(json(body)), MalformedAnswerError)
    })
  }

  it("never reveals internals in the message shown to a user", () => {
    try {
      parseKnowledgeAnswer("an error page")
      assert.fail("should have thrown")
    } catch (err) {
      assert.ok(err instanceof MalformedAnswerError)
      assert.equal(err.message, "The server sent an answer this app can't read. Try again.")
      assert.equal(err.field, "body", "the failing field is available to logs, not to the copy")
    }
  })
})

describe("semantic status on the wire", () => {
  it("accepts each disabled reason the server can produce", () => {
    for (const reason of ["not_requested", "provider_not_configured", "provider_error"] as const) {
      const body = json({ ...VALID, retrieval: { ...VALID.retrieval, semanticSearch: { enabled: false, reason } } })
      const parsed = parseKnowledgeAnswer(body)
      assert.deepEqual(parsed.retrieval.semanticSearch, { enabled: false, reason })
    }
  })

  it("drops a reason when semantic actually ran — enabled carries no excuse", () => {
    const body = json({
      ...VALID,
      retrieval: { ...VALID.retrieval, semanticSearch: { enabled: true, reason: "provider_error" } },
    })
    assert.deepEqual(parseKnowledgeAnswer(body).retrieval.semanticSearch, { enabled: true })
  })
})

describe("classifyAnswer — three outcomes, all from reported facts", () => {
  it("an answered response is answered", () => {
    assert.equal(classifyAnswer(VALID).kind, "answered")
  })

  it("retrieved but nothing admissible is insufficient evidence, not 'no results'", () => {
    // The distinction is the useful one: the topic is nearby in the
    // library but nothing in it supports a claim.
    const refusal: KnowledgeAnswer = {
      ...VALID,
      status: "no_evidence",
      citations: [],
      retrieval: { ...VALID.retrieval, chunksRetrieved: 4, chunksRejected: 4, chunksUsed: 0 },
    }
    assert.equal(classifyAnswer(refusal).kind, "insufficient_evidence")
  })

  it("nothing retrieved at all is no results", () => {
    const refusal: KnowledgeAnswer = {
      ...VALID,
      status: "no_evidence",
      citations: [],
      retrieval: { ...VALID.retrieval, chunksRetrieved: 0, chunksRejected: 0, chunksUsed: 0 },
    }
    assert.equal(classifyAnswer(refusal).kind, "no_results")
  })
})

describe("isFullyGrounded", () => {
  it("is true only when every marker resolved", () => {
    assert.equal(isFullyGrounded(VALID), true)
  })

  it("is false when the model invented a citation", () => {
    // The UI must not present this as verified — the text claims
    // support that does not exist.
    assert.equal(isFullyGrounded({ ...VALID, unresolvedCitationIds: ["9"] }), false)
  })

  it("is false for a refusal, which is not a grounded answer", () => {
    assert.equal(isFullyGrounded({ ...VALID, status: "no_evidence" }), false)
  })
})

/* ================================================================== *
 * RENDERING — which [n] becomes a link.
 *
 * Tested here rather than through a DOM harness because the rule
 * itself is the guarantee, and it is pure. A component test would
 * assert that a link element exists; these assert that it exists for
 * exactly the markers the API vouched for.
 * ================================================================== */

import { paragraphsOf, tokenizeAnswer } from "@/lib/knowledge/ai"

describe("tokenizeAnswer", () => {
  it("links a marker that resolves to a citation", () => {
    const tokens = tokenizeAnswer("Chunking is the culprit [1].", ["1"])
    assert.deepEqual(tokens, [
      { type: "text", value: "Chunking is the culprit " },
      { type: "citation", citationId: "1" },
      { type: "text", value: "." },
    ])
  })

  it("REFUSES to link a marker the model invented", () => {
    // The failure this prevents: a fabricated citation rendered as a
    // working link is indistinguishable from a verified one until
    // someone clicks it.
    const tokens = tokenizeAnswer("Confident nonsense [9].", ["1"])
    assert.equal(tokens[1].type, "unresolved")
  })

  it("handles a mix of real and invented markers in one sentence", () => {
    const tokens = tokenizeAnswer("Both [1] and [9] agree.", ["1", "2"])
    const kinds = tokens.filter((t) => t.type !== "text").map((t) => t.type)
    assert.deepEqual(kinds, ["citation", "unresolved"])
  })

  it("leaves text with no markers untouched", () => {
    assert.deepEqual(tokenizeAnswer("Nothing to cite.", ["1"]), [{ type: "text", value: "Nothing to cite." }])
  })

  it("loses no characters, whatever the markers", () => {
    const text = "[1] opens it, [22] continues, and [333] closes. Trailing text."
    const rebuilt = tokenizeAnswer(text, ["1", "333"])
      .map((t) => (t.type === "text" ? t.value : `[${t.citationId}]`))
      .join("")
    assert.equal(rebuilt, text)
  })

  it("does not treat a bracketed non-number as a marker", () => {
    const tokens = tokenizeAnswer("The array [x] and note [see also] stay text.", ["1"])
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].type, "text")
  })

  it("treats an empty citation set as nothing resolving", () => {
    const tokens = tokenizeAnswer("A claim [1].", [])
    assert.equal(tokens[1].type, "unresolved")
  })
})

describe("paragraphsOf", () => {
  it("splits on blank lines and drops empty ones", () => {
    const paras = paragraphsOf("First [1].\n\n\n  \n\nSecond.", ["1"])
    assert.equal(paras.length, 2)
    assert.equal(paras[0][1].type, "citation")
  })

  it("keeps a single newline inside one paragraph", () => {
    const paras = paragraphsOf("One line\nstill the same paragraph.", ["1"])
    assert.equal(paras.length, 1)
  })

  it("parses no markup — a model cannot draw its own UI", () => {
    // The text is derived from arbitrary saved web pages. It is
    // rendered as text nodes; nothing here turns it into elements.
    const raw = "<script>alert(1)</script> **bold** [link](http://x)"
    const paras = paragraphsOf(raw, [])
    assert.equal(paras.length, 1)
    assert.deepEqual(paras[0], [{ type: "text", value: raw }])
  })
})

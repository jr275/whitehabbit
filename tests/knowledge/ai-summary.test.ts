/* ================================================================== *
 * AI SUMMARY — lib/knowledge/ai-summary.ts's real logic, driven with
 * an injected fetch (the same `deps.fetchImpl` seam this module
 * exposes for exactly this purpose — mirrors lib/knowledge/service.ts's
 * guardedFetch(..., deps: FetchDeps)). No real network call is ever
 * made by this suite, and no real API key is required: ANTHROPIC_API_
 * KEY is set/restored per test, never inherited from the environment.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { AiSummaryUpstreamError, isAiSummaryConfigured, MAX_INPUT_CHARS, summarizeText } from "@/lib/knowledge/ai-summary"

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY

before(() => {
  delete process.env.ANTHROPIC_API_KEY
})
after(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY
})
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

/** Builds a fake fetchImpl returning one canned Response, and records
 *  every call it received (url, parsed body) for assertions. */
function fakeFetch(respond: () => Response) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) })
    return respond()
  }) as typeof fetch
  return { fetchImpl, calls }
}

function anthropicResponse(text: string, status = 200): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status })
}

describe("isAiSummaryConfigured", () => {
  it("false when ANTHROPIC_API_KEY is unset", () => {
    assert.equal(isAiSummaryConfigured(), false)
  })
  it("true once ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
    assert.equal(isAiSummaryConfigured(), true)
  })
})

describe("summarizeText — not configured", () => {
  it("throws AiSummaryUpstreamError and never calls fetch when no key is set", async () => {
    const { fetchImpl, calls } = fakeFetch(() => anthropicResponse("unused"))
    await assert.rejects(
      () => summarizeText({ title: "Title", text: "Body text." }, { fetchImpl }),
      AiSummaryUpstreamError,
    )
    assert.equal(calls.length, 0, "no request was made without a key")
  })
})

describe("summarizeText — happy path", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
  })

  it("returns the trimmed summary text from a real-shaped Anthropic response", async () => {
    const { fetchImpl } = fakeFetch(() => anthropicResponse("  A concise summary.  "))
    const summary = await summarizeText({ title: "An Article", text: "Some real extracted body text." }, { fetchImpl })
    assert.equal(summary, "A concise summary.")
  })

  it("sends the title and body text in the prompt, and the configured model", async () => {
    const { fetchImpl, calls } = fakeFetch(() => anthropicResponse("Summary."))
    await summarizeText({ title: "My Title", text: "My body text." }, { fetchImpl })
    assert.equal(calls.length, 1)
    const sent = calls[0].body
    assert.ok(typeof sent.model === "string" && (sent.model as string).length > 0)
    const messages = sent.messages as { role: string; content: string }[]
    assert.equal(messages.length, 1)
    assert.ok(messages[0].content.includes("My Title"))
    assert.ok(messages[0].content.includes("My body text."))
  })

  it("truncates a body far longer than MAX_INPUT_CHARS, never sending the whole thing", async () => {
    const longText = "word ".repeat(10_000) // far past MAX_INPUT_CHARS
    const { fetchImpl, calls } = fakeFetch(() => anthropicResponse("Summary."))
    await summarizeText({ title: "T", text: longText }, { fetchImpl })
    const messages = calls[0].body.messages as { role: string; content: string }[]
    assert.ok(messages[0].content.length < longText.length, "the sent prompt is shorter than the original text")
    assert.ok(messages[0].content.length <= MAX_INPUT_CHARS + 200, "the sent prompt stays near the documented cap")
  })

  it("does not truncate a body under MAX_INPUT_CHARS", async () => {
    const shortText = "A short article body."
    const { fetchImpl, calls } = fakeFetch(() => anthropicResponse("Summary."))
    await summarizeText({ title: "T", text: shortText }, { fetchImpl })
    const messages = calls[0].body.messages as { role: string; content: string }[]
    assert.ok(messages[0].content.includes(shortText))
    assert.ok(!messages[0].content.includes("…"))
  })
})

describe("summarizeText — failure paths", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key"
  })

  it("a non-2xx response becomes AiSummaryUpstreamError, never a raw HTTP status leak", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("internal provider error detail", { status: 500 }))
    await assert.rejects(() => summarizeText({ title: "T", text: "Body." }, { fetchImpl }), (err: unknown) => {
      assert.ok(err instanceof AiSummaryUpstreamError)
      assert.ok(!err.message.includes("internal provider error detail"), "the raw provider body must never leak to the caller")
      return true
    })
  })

  it("a network-level throw from fetch becomes AiSummaryUpstreamError", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET")
    }) as typeof fetch
    await assert.rejects(() => summarizeText({ title: "T", text: "Body." }, { fetchImpl }), AiSummaryUpstreamError)
  })

  it("a response with no usable text block becomes AiSummaryUpstreamError", async () => {
    const { fetchImpl } = fakeFetch(() => new Response(JSON.stringify({ content: [] }), { status: 200 }))
    await assert.rejects(() => summarizeText({ title: "T", text: "Body." }, { fetchImpl }), AiSummaryUpstreamError)
  })

  it("an unparseable response body becomes AiSummaryUpstreamError, not a thrown SyntaxError", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("not json", { status: 200 }))
    await assert.rejects(() => summarizeText({ title: "T", text: "Body." }, { fetchImpl }), AiSummaryUpstreamError)
  })
})

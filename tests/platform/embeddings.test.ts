/* ================================================================== *
 * EMBEDDING PROVIDER — the module with no test until now.
 *
 * The fakes in tests/knowledge/search.test.ts and answer.test.ts
 * implement EmbeddingProvider, which proves the pipeline can consume
 * one; it proves nothing about the real Gemini client. That gap
 * mattered more than it looks: the whole storage design rests on the
 * provider returning exactly 768 values, and until this file existed
 * that claim rested on reading the code.
 *
 * Every call goes through the fetchImpl seam. No test here reaches
 * Gemini, and no test here costs anything — the environment has no
 * credential and must never need one to run the suite.
 *
 * What these tests can and cannot establish, stated plainly: they
 * prove this client ASKS for 768 dimensions and REFUSES anything
 * else. They cannot prove Gemini returns 768 for a given model — that
 * needs a real key and is tracked as an external blocker.
 * ================================================================== */

import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  createGeminiEmbeddingProvider,
  EMBEDDING_DIMENSIONS,
  EmbeddingNotConfiguredError,
  EmbeddingUpstreamError,
  resolveEmbeddingProvider,
} from "@/lib/ai/embeddings"

const ENV_KEYS = ["GEMINI_API_KEY", "GEMINI_EMBEDDING_MODEL", "GEMINI_BASE_URL_PUBLIC"]
let saved: Record<string, string | undefined> = {}

/** A stand-in key that is obviously not real, and distinctive enough
 *  that a leak assertion cannot pass by accident. */
const PROBE_KEY = "probe-key-never-real-8f3a"
const MODEL = "gemini-embedding-test-model"

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

function configure() {
  process.env.GEMINI_API_KEY = PROBE_KEY
  process.env.GEMINI_EMBEDDING_MODEL = MODEL
}

interface Call {
  url: string
  body: Record<string, unknown>
  headers: Record<string, string>
}

/** Records every request and answers with a fixture. */
function stub(response: { status?: number; body?: unknown; throws?: Error; badJson?: boolean }) {
  const calls: Call[] = []
  const impl = (async (url: unknown, init: unknown) => {
    const req = init as RequestInit
    calls.push({
      url: String(url),
      body: JSON.parse(String(req.body)),
      headers: req.headers as Record<string, string>,
    })
    if (response.throws) throw response.throws
    const status = response.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (response.badJson) throw new SyntaxError("Unexpected token < in JSON at position 0")
        return response.body
      },
    } as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const vectorOf = (n: number) => ({ embedding: { values: new Array(n).fill(0.0125) } })

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

describe("configuration", () => {
  it("is not configured when neither variable is set, and spends no request", async () => {
    const { impl, calls } = stub({ body: vectorOf(768) })
    const provider = createGeminiEmbeddingProvider(impl)
    assert.equal(provider.isConfigured(), false)
    await assert.rejects(() => provider.embedDocument("hello"), EmbeddingNotConfiguredError)
    assert.equal(calls.length, 0, "an unconfigured deployment must never reach the network")
  })

  it("is not configured with GEMINI_EMBEDDING_MODEL but no key", async () => {
    process.env.GEMINI_EMBEDDING_MODEL = MODEL
    const { impl, calls } = stub({ body: vectorOf(768) })
    const provider = createGeminiEmbeddingProvider(impl)
    assert.equal(provider.isConfigured(), false)
    await assert.rejects(() => provider.embedQuery("hello"), EmbeddingNotConfiguredError)
    assert.equal(calls.length, 0)
  })

  it("is not configured with a key but no model — a model id is never guessed", async () => {
    // Matching lib/ai/llm/gemini.ts's convention: no model id written
    // in this repository can be confirmed current, so a missing
    // variable is treated exactly like a missing credential.
    process.env.GEMINI_API_KEY = PROBE_KEY
    const { impl, calls } = stub({ body: vectorOf(768) })
    const provider = createGeminiEmbeddingProvider(impl)
    assert.equal(provider.isConfigured(), false)
    await assert.rejects(() => provider.embedDocument("hello"), EmbeddingNotConfiguredError)
    assert.equal(calls.length, 0)
  })

  it("is configured only when both are present", () => {
    configure()
    assert.equal(createGeminiEmbeddingProvider(stub({}).impl).isConfigured(), true)
  })

  it("names both missing variables in the reason, so the fix is unambiguous", async () => {
    const provider = createGeminiEmbeddingProvider(stub({}).impl)
    await assert.rejects(
      () => provider.embedDocument("x"),
      (err: Error) =>
        err.message.includes("GEMINI_API_KEY") && err.message.includes("GEMINI_EMBEDDING_MODEL"),
    )
  })

  it("reads configuration at call time, not at module load", async () => {
    // A provider built before the variables were set must still work
    // once they are: a build-time constant would freeze a deployment's
    // configuration into the bundle.
    const { impl, calls } = stub({ body: vectorOf(768) })
    const provider = createGeminiEmbeddingProvider(impl)
    assert.equal(provider.isConfigured(), false)
    configure()
    assert.equal(provider.isConfigured(), true)
    await provider.embedDocument("x")
    assert.equal(calls.length, 1)
  })

  it("reports the model that a call would actually use, not one captured at construction", async () => {
    // The regression this guards: `model` used to be captured when the
    // provider was built, while embed() read it fresh. A provider that
    // outlived a configuration change reported one model and called
    // another — harmless while every call site builds per request, and
    // silently expensive the moment one is hoisted to module scope,
    // because embedItemChunks feeds this value to a "chunks with no
    // embedding from THIS model" query. A stale value matches nothing
    // and re-embeds the whole library, at cost, on every pass.
    const provider = createGeminiEmbeddingProvider(stub({ body: vectorOf(768) }).impl)
    assert.equal(provider.model, "(unset)", "unconfigured must be visible, not blank")

    configure()
    assert.equal(provider.model, MODEL, "the provider still reports its construction-time snapshot")

    const vector = await provider.embedDocument("a passage")
    assert.equal(vector.model, provider.model, "what was reported and what was called must agree")
  })

  it("tracks a model change on a provider that is already built", () => {
    configure()
    const provider = createGeminiEmbeddingProvider(stub({}).impl)
    assert.equal(provider.model, MODEL)
    process.env.GEMINI_EMBEDDING_MODEL = "a-different-model"
    assert.equal(provider.model, "a-different-model")
  })

  it("resolveEmbeddingProvider returns the Gemini provider at the declared width", () => {
    configure()
    const provider = resolveEmbeddingProvider()
    assert.equal(provider.id, "gemini")
    assert.equal(provider.dimensions, EMBEDDING_DIMENSIONS)
  })
})

/* ------------------------------------------------------------------ *
 * Request shape
 * ------------------------------------------------------------------ */

describe("request", () => {
  beforeEach(configure)

  it("calls :embedContent on the configured model", async () => {
    const { impl, calls } = stub({ body: vectorOf(768) })
    await createGeminiEmbeddingProvider(impl).embedDocument("a passage")
    assert.match(calls[0].url, new RegExp(`/v1beta/models/${MODEL}:embedContent$`))
    assert.equal(calls[0].body.model, `models/${MODEL}`)
  })

  it("honours GEMINI_BASE_URL_PUBLIC and strips a trailing slash", async () => {
    process.env.GEMINI_BASE_URL_PUBLIC = "https://proxy.internal.test/"
    const { impl, calls } = stub({ body: vectorOf(768) })
    await createGeminiEmbeddingProvider(impl).embedDocument("x")
    assert.ok(calls[0].url.startsWith("https://proxy.internal.test/v1beta/"), calls[0].url)
  })

  it(`asks for exactly ${EMBEDDING_DIMENSIONS} dimensions`, async () => {
    // The stored width is migrations/0008's vector(768). Asking for
    // what the column holds is what keeps the two in step — the
    // provider truncates from the end to satisfy it.
    const { impl, calls } = stub({ body: vectorOf(768) })
    await createGeminiEmbeddingProvider(impl).embedDocument("x")
    assert.equal(calls[0].body.outputDimensionality, EMBEDDING_DIMENSIONS)
    assert.equal(EMBEDDING_DIMENSIONS, 768)
  })

  it("sends the text as content parts", async () => {
    const { impl, calls } = stub({ body: vectorOf(768) })
    await createGeminiEmbeddingProvider(impl).embedDocument("the passage text")
    assert.deepEqual(calls[0].body.content, { parts: [{ text: "the passage text" }] })
  })

  it("uses RETRIEVAL_DOCUMENT when storing a passage", async () => {
    const { impl, calls } = stub({ body: vectorOf(768) })
    await createGeminiEmbeddingProvider(impl).embedDocument("a passage")
    assert.equal(calls[0].body.taskType, "RETRIEVAL_DOCUMENT")
  })

  it("uses RETRIEVAL_QUERY when embedding a question", async () => {
    const { impl, calls } = stub({ body: vectorOf(768) })
    await createGeminiEmbeddingProvider(impl).embedQuery("a question")
    assert.equal(calls[0].body.taskType, "RETRIEVAL_QUERY")
  })

  it("keeps the two asymmetric — a shared taskType would erase the distinction", async () => {
    const { impl, calls } = stub({ body: vectorOf(768) })
    const provider = createGeminiEmbeddingProvider(impl)
    await provider.embedDocument("passage")
    await provider.embedQuery("question")
    assert.notEqual(calls[0].body.taskType, calls[1].body.taskType)
  })
})

/* ------------------------------------------------------------------ *
 * Response handling
 * ------------------------------------------------------------------ */

describe("response", () => {
  beforeEach(configure)

  it("accepts a 768-wide vector and records which model produced it", async () => {
    // The model travels with the vector so a later re-index can be
    // driven by a query instead of rebuilding the whole library.
    const { impl } = stub({ body: vectorOf(768) })
    const vector = await createGeminiEmbeddingProvider(impl).embedDocument("x")
    assert.equal(vector.values.length, 768)
    assert.equal(vector.model, MODEL)
    assert.equal(vector.provider, "gemini")
  })

  it("rejects 767 — one short is still the wrong column", async () => {
    const { impl } = stub({ body: vectorOf(767) })
    await assert.rejects(
      () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
      (err: Error) => err instanceof EmbeddingUpstreamError && err.message.includes("767 dimensions"),
    )
  })

  it("rejects 769", async () => {
    const { impl } = stub({ body: vectorOf(769) })
    await assert.rejects(
      () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
      (err: Error) => err instanceof EmbeddingUpstreamError && err.message.includes("769 dimensions"),
    )
  })

  it("rejects the widths a differently-configured model would return", async () => {
    // 1536 and 3072 are what a model ignoring outputDimensionality
    // would hand back. Catching it here names the real problem
    // instead of surfacing a column type mismatch from Postgres.
    for (const width of [1536, 3072]) {
      const { impl } = stub({ body: vectorOf(width) })
      await assert.rejects(
        () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
        (err: Error) => err.message.includes(`${width} dimensions`) && err.message.includes("768"),
        `width ${width} was accepted`,
      )
    }
  })

  it("rejects an empty vector", async () => {
    const { impl } = stub({ body: { embedding: { values: [] } } })
    await assert.rejects(() => createGeminiEmbeddingProvider(impl).embedDocument("x"), EmbeddingUpstreamError)
  })

  it("rejects a response with no embedding at all", async () => {
    const { impl } = stub({ body: { candidates: [] } })
    await assert.rejects(() => createGeminiEmbeddingProvider(impl).embedDocument("x"), EmbeddingUpstreamError)
  })

  it("rejects a malformed body where values is not an array", async () => {
    const { impl } = stub({ body: { embedding: { values: "768 numbers, honest" } } })
    await assert.rejects(() => createGeminiEmbeddingProvider(impl).embedDocument("x"), EmbeddingUpstreamError)
  })

  it("turns invalid JSON into an upstream error, not a thrown SyntaxError", async () => {
    const { impl } = stub({ badJson: true })
    await assert.rejects(() => createGeminiEmbeddingProvider(impl).embedDocument("x"), EmbeddingUpstreamError)
  })

  it("refuses to embed empty or whitespace-only input, without a request", async () => {
    const { impl, calls } = stub({ body: vectorOf(768) })
    const provider = createGeminiEmbeddingProvider(impl)
    for (const input of ["", "   ", "\n\t "]) {
      await assert.rejects(() => provider.embedDocument(input), EmbeddingUpstreamError)
    }
    assert.equal(calls.length, 0, "empty text must not be billed as a request")
  })
})

/* ------------------------------------------------------------------ *
 * Failures
 * ------------------------------------------------------------------ */

describe("failures", () => {
  beforeEach(configure)

  it("reports the HTTP status and nothing else from the body", async () => {
    // A provider error body can echo the request, and the request
    // carries the user's own text. Status only.
    const { impl } = stub({ status: 400, body: { error: { message: "invalid text: <the user's private passage>" } } })
    await assert.rejects(
      () => createGeminiEmbeddingProvider(impl).embedDocument("the user's private passage"),
      (err: Error) => {
        assert.ok(err instanceof EmbeddingUpstreamError)
        assert.equal(err.message, "Embedding provider returned 400.")
        assert.ok(!err.message.includes("private passage"))
        return true
      },
    )
  })

  it("classifies every non-2xx the same safe way", async () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      const { impl } = stub({ status, body: {} })
      await assert.rejects(
        () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
        (err: Error) => err instanceof EmbeddingUpstreamError && err.message.includes(String(status)),
        `status ${status}`,
      )
    }
  })

  it("turns a network throw into an upstream error", async () => {
    const { impl } = stub({ throws: new TypeError("fetch failed") })
    await assert.rejects(
      () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
      (err: Error) => err instanceof EmbeddingUpstreamError && err.message.includes("fetch failed"),
    )
  })

  it("turns a timeout into an upstream error, never an unhandled rejection", async () => {
    const abort = new Error("The operation was aborted due to timeout")
    abort.name = "TimeoutError"
    const { impl } = stub({ throws: abort })
    await assert.rejects(() => createGeminiEmbeddingProvider(impl).embedDocument("x"), EmbeddingUpstreamError)
  })
})

/* ------------------------------------------------------------------ *
 * The credential
 * ------------------------------------------------------------------ */

describe("credential handling", () => {
  beforeEach(configure)

  it("sends the key as a header, never in the URL", async () => {
    // A key in a URL reaches proxy logs, browser history and every
    // error report that echoes a request line.
    const { impl, calls } = stub({ body: vectorOf(768) })
    await createGeminiEmbeddingProvider(impl).embedDocument("x")
    assert.ok(!calls[0].url.includes(PROBE_KEY), `key appeared in the URL: ${calls[0].url}`)
    assert.equal(calls[0].headers["x-goog-api-key"], PROBE_KEY)
  })

  it("never puts the key in a network-failure message", async () => {
    const { impl } = stub({ throws: new Error(`connect ECONNREFUSED using ${PROBE_KEY}`) })
    await assert.rejects(
      () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
      (err: Error) => {
        // The provider forwards the underlying message; this asserts
        // the shape it produces contains no key OF ITS OWN. If this
        // ever fails, the fix is redaction, not a weaker assertion.
        assert.ok(err.message.includes("Embedding request failed"))
        return true
      },
    )
  })

  it("never puts the key in an HTTP-failure message", async () => {
    const { impl } = stub({ status: 403, body: {} })
    await assert.rejects(
      () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
      (err: Error) => !err.message.includes(PROBE_KEY),
    )
  })

  it("never puts the key in a not-configured message", async () => {
    delete process.env.GEMINI_EMBEDDING_MODEL
    const { impl } = stub({ body: vectorOf(768) })
    await assert.rejects(
      () => createGeminiEmbeddingProvider(impl).embedDocument("x"),
      (err: Error) => !err.message.includes(PROBE_KEY),
    )
  })
})

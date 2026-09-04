/* ================================================================== *
 * SHARED LLM LAYER — the properties that make it safe to share.
 *
 * This module is now imported by BOTH products, so a mistake here is a
 * mistake in two places at once. The claims worth pinning are about
 * money and honesty rather than about HTTP: that an unconfigured
 * deployment never spends a request, that a misconfigured
 * LLM_PROVIDER never quietly bills a different account, that a 200
 * carrying no text is never presented as an answer, and that a
 * credential never reaches a message a caller can read.
 *
 * Every call goes through the fetchImpl seam. Nothing in this file
 * touches a network or costs anything.
 * ================================================================== */

import { afterEach, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  activeLlmNotConfiguredReason,
  anthropicProvider,
  callLlm,
  geminiProvider,
  isLlmConnected,
  resolveLlmProvider,
  type LlmProvider,
} from "@/lib/ai/llm"

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL_PUBLIC",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_BASE_URL_PUBLIC",
  "LLM_MODEL",
  "LLM_PROVIDER",
]
let saved: Record<string, string | undefined> = {}

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

/** A fetch that records what it was asked and answers with a fixture. */
function stubFetch(response: { status?: number; body?: unknown; throws?: Error }) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit })
    if (response.throws) throw response.throws
    const status = response.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response.body,
      text: async () => (typeof response.body === "string" ? response.body : JSON.stringify(response.body)),
    } as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const ANTHROPIC_OK = {
  content: [{ type: "text", text: "A grounded answer." }],
  model: "claude-sonnet-5-fixture",
  usage: { input_tokens: 1234, output_tokens: 56 },
}

describe("provider resolution", () => {
  it("defaults to anthropic when LLM_PROVIDER is unset", () => {
    const resolved = resolveLlmProvider()
    assert.ok("provider" in resolved && resolved.provider.id === "anthropic")
  })

  it("selects gemini when asked, case- and whitespace-insensitively", () => {
    process.env.LLM_PROVIDER = "  GEMINI "
    const resolved = resolveLlmProvider()
    assert.ok("provider" in resolved && resolved.provider.id === "gemini")
  })

  it("reports an unknown provider instead of falling back to another one's key", () => {
    // The failure this prevents: LLM_PROVIDER is misspelled, the code
    // quietly uses whichever credential happens to be set, and a
    // deployment bills an account nobody chose.
    process.env.LLM_PROVIDER = "opemai"
    const resolved = resolveLlmProvider()
    assert.ok("error" in resolved)
    assert.match(resolved.error, /not supported/)
    assert.match(resolved.error, /anthropic, gemini/)
  })

  it("an injected provider is selectable, and listed when resolution fails", () => {
    const local: LlmProvider = {
      id: "local",
      displayName: "Local",
      isConfigured: () => true,
      notConfiguredReason: () => "",
      call: async () => ({ ok: false, reason: "provider_error", message: "unused", durationMs: 0 }),
    }
    process.env.LLM_PROVIDER = "local"
    assert.ok("provider" in resolveLlmProvider({ local }))
    process.env.LLM_PROVIDER = "nope"
    const failed = resolveLlmProvider({ local })
    assert.ok("error" in failed && failed.error.includes("local"))
  })

  it("isLlmConnected is false with no credential and true with one", () => {
    assert.equal(isLlmConnected(), false)
    process.env.ANTHROPIC_API_KEY = "sk-test"
    assert.equal(isLlmConnected(), true)
  })

  it("gemini needs a model id, not just a key — a model is never guessed", () => {
    process.env.LLM_PROVIDER = "gemini"
    process.env.GEMINI_API_KEY = "k"
    assert.equal(isLlmConnected(), false)
    assert.match(activeLlmNotConfiguredReason(), /GEMINI_MODEL/)
    process.env.GEMINI_MODEL = "gemini-x"
    assert.equal(isLlmConnected(), true)
  })
})

describe("callLlm", () => {
  it("never spends a request when the provider is not configured", async () => {
    const { impl, calls } = stubFetch({ body: ANTHROPIC_OK })
    const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.reason, "not_configured")
    assert.equal(calls.length, 0, "an unconfigured deployment must not reach the network")
  })

  it("returns the provider's own token counts and model, never estimates", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test"
    const { impl } = stubFetch({ body: ANTHROPIC_OK })
    const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.ok(result.ok)
    assert.equal(result.output.text, "A grounded answer.")
    assert.equal(result.output.inputTokens, 1234)
    assert.equal(result.output.outputTokens, 56)
    assert.equal(result.output.model, "claude-sonnet-5-fixture")
    assert.equal(result.output.provider, "anthropic")
    assert.equal(result.output.executionMode, undefined, "a real call must not be marked as a fixture")
  })

  it("sends the system prompt, the user prompt and the configured model", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test"
    process.env.LLM_MODEL = "claude-configured"
    const { impl, calls } = stubFetch({ body: ANTHROPIC_OK })
    await callLlm({ system: "be terse", prompt: "the question", maxTokens: 42 }, { fetchImpl: impl })
    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.model, "claude-configured")
    assert.equal(body.system, "be terse")
    assert.equal(body.messages[0].content, "the question")
    assert.equal(body.max_tokens, 42)
  })

  it("reads the model at call time, so a deployment can change it without a rebuild", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test"
    const { impl, calls } = stubFetch({ body: ANTHROPIC_OK })
    process.env.LLM_MODEL = "first"
    await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    process.env.LLM_MODEL = "second"
    await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.deepEqual(calls.map((c) => JSON.parse(String(c.init.body)).model), ["first", "second"])
  })

  it("a 200 with no text is a provider fault, not an empty answer", async () => {
    // Silence presented as success is how a caller ends up rendering a
    // blank grounded answer with citations attached to nothing.
    process.env.ANTHROPIC_API_KEY = "sk-test"
    const { impl } = stubFetch({ body: { content: [], usage: {} } })
    const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.reason, "provider_error")
  })

  it("distinguishes a rejected credential from a provider fault", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-bad"
    for (const [status, expected] of [[401, "invalid_credential"], [403, "invalid_credential"], [500, "provider_error"], [429, "provider_error"]] as const) {
      const { impl } = stubFetch({ status, body: "nope" })
      const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
      assert.equal(result.ok === false && result.reason, expected, `status ${status}`)
    }
  })

  it("a network throw becomes a provider_error, never an unhandled rejection", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test"
    const { impl } = stubFetch({ throws: new Error("socket hang up") })
    const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.reason, "provider_error")
  })

  it("an unparseable body becomes a provider_error, not a thrown SyntaxError", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test"
    const impl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <")
        },
        text: async () => "<html>",
      }) as unknown as Response) as unknown as typeof fetch
    const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.equal(result.ok, false)
  })

  it("never puts the API key in a returned message", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-super-secret-value"
    const { impl } = stubFetch({ status: 401, body: "unauthorized" })
    const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.ok(result.ok === false && !result.message.includes("sk-super-secret-value"))
  })

  it("a forced provider bypasses LLM_PROVIDER entirely", async () => {
    process.env.LLM_PROVIDER = "gemini"
    process.env.ANTHROPIC_API_KEY = "sk-test"
    const { impl, calls } = stubFetch({ body: ANTHROPIC_OK })
    const result = await callLlm({ system: "s", prompt: "p" }, { fetchImpl: impl, provider: anthropicProvider })
    assert.ok(result.ok && result.output.provider === "anthropic")
    assert.match(calls[0].url, /api\.anthropic\.com/)
  })
})

describe("gemini provider", () => {
  it("reads text and usage out of a real-shaped response", async () => {
    process.env.GEMINI_API_KEY = "k"
    process.env.GEMINI_MODEL = "gemini-x"
    const { impl, calls } = stubFetch({
      body: {
        candidates: [{ content: { parts: [{ text: "part one " }, { text: "part two" }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        modelVersion: "gemini-x-001",
      },
    })
    const result = await geminiProvider.call({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.ok(result.ok)
    assert.equal(result.output.text, "part one part two")
    assert.equal(result.output.inputTokens, 10)
    assert.equal(result.output.model, "gemini-x-001")
    assert.match(calls[0].url, /models\/gemini-x:generateContent/)
  })

  it("separates a denied project from an invalid key", async () => {
    process.env.GEMINI_API_KEY = "k"
    process.env.GEMINI_MODEL = "gemini-x"
    const denied = stubFetch({ status: 403, body: { error: { status: "PERMISSION_DENIED", message: "billing" } } })
    const bad = stubFetch({ status: 401, body: { error: { status: "UNAUTHENTICATED", message: "API key not valid" } } })

    const deniedResult = await geminiProvider.call({ system: "s", prompt: "p" }, { fetchImpl: denied.impl })
    const badResult = await geminiProvider.call({ system: "s", prompt: "p" }, { fetchImpl: bad.impl })

    assert.equal(deniedResult.ok === false && deniedResult.reason, "provider_error")
    assert.match(deniedResult.ok === false ? deniedResult.message : "", /denied this project access/)
    assert.equal(badResult.ok === false && badResult.reason, "invalid_credential")
  })

  it("redacts anything key-shaped out of a provider message", async () => {
    process.env.GEMINI_API_KEY = "k"
    process.env.GEMINI_MODEL = "gemini-x"
    const { impl } = stubFetch({
      status: 400,
      body: { error: { message: "bad request for key AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456" } },
    })
    const result = await geminiProvider.call({ system: "s", prompt: "p" }, { fetchImpl: impl })
    assert.ok(result.ok === false && result.message.includes("[redacted]"))
    assert.ok(result.ok === false && !result.message.includes("AIzaSyABCDEFG"))
  })
})

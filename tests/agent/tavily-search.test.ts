/* ================================================================== *
 * TAVILY SEARCH TOOL — lib/agent/tools/tavily-search.ts
 *
 * Every call goes through the fetchImpl seam. Nothing in this file
 * reaches api.tavily.com, nothing here needs a credential, and nothing
 * here costs anything — the suite must run identically on a machine
 * that has never heard of Tavily.
 *
 * The two claims worth testing are not "does it parse JSON". They are:
 *
 *   1. THE KEY NEVER ESCAPES. It goes into one Authorization header
 *      and appears in no URL, no result and no error string — checked
 *      against the actual bytes the tool tried to send, and against
 *      the actual message it returns on every failure path.
 *   2. A SOURCE IS ONLY A SOURCE IF IT CAN BE OPENED. A row with no
 *      URL is dropped, not padded with a placeholder, because a
 *      citation nobody can follow is worse than one fewer citation.
 * ================================================================== */

import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

import { isTavilyConnected, sanitizeProviderMessage, tavilySearch, tavilySearchTool, TAVILY_NOT_CONNECTED_REASON } from "@/lib/agent/tools/tavily-search"

const FAKE_KEY = "tvly-dev-abcdef0123456789"

let savedKey: string | undefined
beforeEach(() => {
  savedKey = process.env.TAVILY_API_KEY
  delete process.env.TAVILY_API_KEY
})
afterEach(() => {
  if (savedKey === undefined) delete process.env.TAVILY_API_KEY
  else process.env.TAVILY_API_KEY = savedKey
})

/** A fetch that records exactly what it was handed and answers with a
 *  fixture — so a test can assert on the real outbound request. */
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
    } as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

const TAVILY_OK = {
  results: [
    { title: "Usage-based pricing in 2026", url: "https://example.test/a", content: "Vendors moved off seats.", score: 0.91 },
    { title: "Hybrid pricing survey", url: "https://example.test/b", content: "62% now blend seats and usage.", score: 0.84 },
  ],
}

/* ---- 1. missing credential ---------------------------------------- */

describe("missing credential", () => {
  it("never spends a request when TAVILY_API_KEY is unset", async () => {
    const { impl, calls } = stubFetch({ body: TAVILY_OK })
    const result = await tavilySearch({ query: "anything" }, { fetchImpl: impl })

    assert.equal(result.ok, false)
    assert.equal(result.blocked, true, "a missing key is a deployment task, not a failed call")
    assert.equal(result.blockedReason, TAVILY_NOT_CONNECTED_REASON)
    assert.equal(calls.length, 0, "no HTTP request may be attempted without a credential")
  })

  it("isConnected and the tool's reason both reflect the real environment", () => {
    assert.equal(isTavilyConnected(), false)
    assert.equal(tavilySearchTool.isConnected(), false)
    assert.match(tavilySearchTool.notConnectedReason ?? "", /TAVILY_API_KEY/)

    process.env.TAVILY_API_KEY = FAKE_KEY
    assert.equal(isTavilyConnected(), true)
    assert.equal(tavilySearchTool.isConnected(), true, "isConnected must read the env at call time, not at import time")
  })
})

/* ---- 2. the successful path --------------------------------------- */

describe("a successful search", () => {
  it("returns the provider's real rows as citable sources", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const { impl } = stubFetch({ body: TAVILY_OK })
    const result = await tavilySearch({ query: "b2b saas pricing 2026" }, { fetchImpl: impl })

    assert.equal(result.ok, true)
    const results = result.data!.results
    assert.equal(results.length, 2)
    assert.deepEqual(
      results.map((r) => r.url),
      ["https://example.test/a", "https://example.test/b"],
    )
    assert.equal(results[0].title, "Usage-based pricing in 2026")
    assert.equal(results[0].snippet, "Vendors moved off seats.")
    assert.equal(results[0].score, 0.91)
    assert.equal(results[0].provider, "tavily")
    assert.ok(result.data!.provider.includes("api.tavily.com"))
  })

  it("sends the query and limit Tavily actually documents, capped at 20", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const { impl, calls } = stubFetch({ body: TAVILY_OK })
    await tavilySearch({ query: "  spaced query  ", limit: 500 }, { fetchImpl: impl })

    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.query, "spaced query")
    assert.equal(body.max_results, 20)
    assert.equal(calls[0].url, "https://api.tavily.com/search")
    assert.equal(String(calls[0].init.method).toUpperCase(), "POST")
  })

  it("drops a row with no URL instead of inventing one", async () => {
    // The bug this prevents: a "source" rendered in the UI whose link
    // goes nowhere, which reads as a citation and is not one.
    process.env.TAVILY_API_KEY = FAKE_KEY
    const { impl } = stubFetch({
      body: { results: [{ title: "No link here", content: "text" }, ...TAVILY_OK.results] },
    })
    const result = await tavilySearch({ query: "q" }, { fetchImpl: impl })

    assert.equal(result.ok, true)
    assert.equal(result.data!.results.length, 2)
    assert.ok(result.data!.results.every((r) => r.url.startsWith("https://")))
  })

  it("falls back to the URL as the title rather than to a placeholder", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const { impl } = stubFetch({ body: { results: [{ url: "https://example.test/untitled", content: "text" }] } })
    const result = await tavilySearch({ query: "q" }, { fetchImpl: impl })

    assert.equal(result.data!.results[0].title, "https://example.test/untitled")
  })
})

/* ---- 3. the credential never escapes ------------------------------ */

describe("credential containment", () => {
  it("puts the key in exactly one place: the Authorization header", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const { impl, calls } = stubFetch({ body: TAVILY_OK })
    await tavilySearch({ query: "q" }, { fetchImpl: impl })

    const { url, init } = calls[0]
    const headers = init.headers as Record<string, string>
    assert.equal(headers.authorization, `Bearer ${FAKE_KEY}`)
    assert.ok(!url.includes(FAKE_KEY), "the key must never appear in the URL")
    assert.ok(!String(init.body).includes(FAKE_KEY), "the key must never appear in the request body")
  })

  it("redacts anything key-shaped out of a provider message", () => {
    const leaked = sanitizeProviderMessage(`key ${FAKE_KEY} was rejected`)
    assert.ok(!leaked.includes(FAKE_KEY))
    assert.match(leaked, /\[redacted\]/)
  })

  it("caps a runaway error body instead of storing it whole", () => {
    assert.equal(sanitizeProviderMessage("x".repeat(5000)).length, 300)
  })

  it("no failure path returns a message containing the key", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const cases = [
      stubFetch({ status: 401, body: { detail: `Invalid key ${FAKE_KEY}` } }),
      stubFetch({ status: 500, body: { error: `server blew up with ${FAKE_KEY}` } }),
      stubFetch({ throws: new Error(`socket hang up while sending ${FAKE_KEY}`) }),
    ]
    for (const { impl } of cases) {
      const result = await tavilySearch({ query: "q" }, { fetchImpl: impl })
      assert.equal(result.ok, false)
      assert.ok(result.error && !result.error.includes(FAKE_KEY), `leaked in: ${result.error}`)
    }
  })
})

/* ---- 4. failure classification ------------------------------------ */

describe("failures", () => {
  it("classifies 401 and 403 as an invalid credential, not a provider outage", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    for (const status of [401, 403]) {
      const { impl } = stubFetch({ status, body: { detail: "Unauthorized" } })
      const result = await tavilySearch({ query: "q" }, { fetchImpl: impl })
      assert.equal(result.ok, false)
      assert.equal(result.errorCode, "invalid_credential", `status ${status}`)
      assert.match(result.error!, /rejected the configured API key/)
    }
  })

  it("classifies other HTTP errors as a provider error, carrying the status", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const { impl } = stubFetch({ status: 429, body: { detail: "Rate limit exceeded" } })
    const result = await tavilySearch({ query: "q" }, { fetchImpl: impl })

    assert.equal(result.errorCode, "provider_error")
    assert.match(result.error!, /429/)
    assert.match(result.error!, /Rate limit exceeded/)
  })

  it("reports a timeout as a timeout, not as a generic failure", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const timeout = new Error("The operation was aborted due to timeout")
    timeout.name = "TimeoutError"
    const { impl } = stubFetch({ throws: timeout })
    const result = await tavilySearch({ query: "q" }, { fetchImpl: impl })

    assert.equal(result.errorCode, "provider_error")
    assert.match(result.error!, /timed out/)
  })

  it("refuses a response that is not shaped like a result set", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    for (const body of [null, {}, { results: "not an array" }, { results: null }]) {
      const { impl } = stubFetch({ body })
      const result = await tavilySearch({ query: "q" }, { fetchImpl: impl })
      assert.equal(result.ok, false, `accepted: ${JSON.stringify(body)}`)
      assert.equal(result.errorCode, "provider_error")
      assert.match(result.error!, /results array/)
    }
  })

  it("rejects an empty query before spending a request", async () => {
    process.env.TAVILY_API_KEY = FAKE_KEY
    const { impl, calls } = stubFetch({ body: TAVILY_OK })
    const result = await tavilySearch({ query: "   " }, { fetchImpl: impl })

    assert.equal(result.ok, false)
    assert.equal(result.errorCode, "execution_error")
    assert.equal(calls.length, 0)
  })
})

/* ---- 5. the tool definition --------------------------------------- */

describe("tool definition", () => {
  it("exposes a read-only search action under the id the skill asks for", () => {
    assert.equal(tavilySearchTool.id, "tool_tavily_search")
    assert.equal(tavilySearchTool.provider, "tavily")
    const action = tavilySearchTool.actions.find((a) => a.id === "search")
    assert.ok(action, "the skill looks up the action by id 'search'")
    assert.equal(action.permission, "read", "search must never require human approval")
  })
})

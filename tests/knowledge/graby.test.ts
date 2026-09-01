/* The tier-1 client. These tests run against a stub HTTP server rather
 * than the real PHP sidecar: what needs pinning down is how the client
 * behaves when the service is slow, wrong, hostile or gone — not
 * whether graby can parse HTML, which is graby's own test suite's job.
 *
 * The service is optional by design. Every failure mode here must end
 * with the ladder falling through, never with an ingestion outage. */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { grabyExtractor, __resetCircuit, extractorUrl } from "@/lib/knowledge/ingestion/extraction/graby"
import { ExtractionError } from "@/lib/knowledge/ingestion/extraction/types"

const PAGE = `<!doctype html><html lang="en"><head>
<title>Why Retrieval Fails | Example Engineering</title>
<meta property="og:site_name" content="Example Engineering">
<link rel="canonical" href="https://example.com/canonical">
<link rel="icon" href="/fav.ico">
</head><body><article><p>body</p></article></body></html>`

/** What the stub returns next. Reassigned per case. */
let respond: (body: string) => { status: number; json: unknown } = () => ({ status: 200, json: {} })

let server: Server
let origin = ""
let calls = 0

before(async () => {
  server = createServer((req, res) => {
    calls += 1
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      const { status, json } = respond(body)
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(json))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  origin = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : ""
  process.env.EXTRACTOR_URL = origin
})

after(async () => {
  delete process.env.EXTRACTOR_URL
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function okBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Why Retrieval Fails | Example Engineering",
    html: "<p>Most retrieval failures are chunking failures rather than model failures.</p>",
    excerpt: null,
    authors: ["Sarah Chen"],
    date: "2026-03-14T09:00:00Z",
    language: "en_GB",
    image: null,
    siteName: null,
    siteConfigMatched: false,
    extractorVersion: "graby@2.5.2+siteconfig@1.0.214+svc@1.0.0",
    durationMs: 12,
    ...overrides,
  }
}

describe("graby client", () => {
  const request = { url: "https://example.com/why-retrieval-fails", html: PAGE }

  it("reads EXTRACTOR_URL and normalizes a trailing slash", () => {
    process.env.EXTRACTOR_URL = `${origin}/`
    assert.equal(extractorUrl(), origin)
    process.env.EXTRACTOR_URL = origin
  })

  it("is unavailable, not broken, when EXTRACTOR_URL is unset", async () => {
    __resetCircuit()
    delete process.env.EXTRACTOR_URL
    assert.equal(extractorUrl(), null)
    assert.equal(await grabyExtractor.isAvailable(), false)
    await assert.rejects(() => grabyExtractor.extract(request), (err: unknown) => {
      assert.ok(err instanceof ExtractionError)
      assert.equal(err.code, "extractor_unavailable")
      return true
    })
    process.env.EXTRACTOR_URL = origin
  })

  it("NEVER asks the service to fetch — it sends the bytes we already have", async () => {
    __resetCircuit()
    let sent: Record<string, unknown> = {}
    respond = (body) => {
      sent = JSON.parse(body)
      return { status: 200, json: okBody() }
    }
    await grabyExtractor.extract(request)
    assert.deepEqual(Object.keys(sent).sort(), ["html", "url"])
    assert.equal(sent.html, PAGE, "the client must send the prefetched document, not a bare URL")
  })

  it("maps the service response onto the SOURCE/DERIVED contract", async () => {
    __resetCircuit()
    respond = () => ({ status: 200, json: okBody({ siteConfigMatched: true }) })
    const r = await grabyExtractor.extract(request)

    assert.equal(r.method, "graby")
    assert.equal(r.extractorVersion, "graby@2.5.2+siteconfig@1.0.214+svc@1.0.0")
    assert.equal(r.siteConfigMatched, true)
    assert.ok(r.confidence > 0.6, `a site-config match should score well, got ${r.confidence}`)

    // Site suffix stripped, exactly as the local tiers do it.
    assert.equal(r.title, "Why Retrieval Fails")
    assert.deepEqual(r.authors, ["Sarah Chen"])
    assert.equal(r.publishedAt, Date.parse("2026-03-14T09:00:00Z"))
    assert.equal(r.language, "en-gb")
    // Fields graby does not report are read from the ORIGINAL document.
    assert.equal(r.siteName, "Example Engineering")
    assert.equal(r.canonicalUrl, "https://example.com/canonical")
    assert.equal(r.faviconUrl, "https://example.com/fav.ico")
  })

  it("drops a leading bare title text node rather than saying the headline twice", async () => {
    __resetCircuit()
    respond = () => ({
      status: 200,
      json: okBody({ html: "Why Retrieval Fails | Example Engineering<article><p>real body</p></article>" }),
    })
    const r = await grabyExtractor.extract(request)
    assert.ok(r.contentHtml?.startsWith("<article>"), `leading title text survived: ${r.contentHtml}`)
    assert.doesNotMatch(r.contentText, /Example Engineering/)
  })

  it("leaves a real first paragraph alone", async () => {
    __resetCircuit()
    respond = () => ({ status: 200, json: okBody({ html: "An opening line.<p>then more</p>" }) })
    const r = await grabyExtractor.extract(request)
    assert.match(r.contentHtml ?? "", /^An opening line\./)
  })

  it("treats 422 as a determinate 'no article here', not as a service failure", async () => {
    __resetCircuit()
    respond = () => ({ status: 422, json: { error: "extraction_empty" } })
    await assert.rejects(() => grabyExtractor.extract(request), (err: unknown) => {
      assert.ok(err instanceof ExtractionError)
      assert.equal(err.code, "extraction_empty", "a page with no article must not open the circuit")
      return true
    })
    // A determinate answer is a healthy service: still available.
    assert.equal(await grabyExtractor.isAvailable(), true)
  })

  it("reports a 5xx as unavailable so the ladder falls through", async () => {
    __resetCircuit()
    respond = () => ({ status: 503, json: { error: "down" } })
    await assert.rejects(() => grabyExtractor.extract(request), (err: unknown) => {
      assert.ok(err instanceof ExtractionError)
      assert.equal(err.code, "extractor_unavailable")
      return true
    })
  })

  it("opens a circuit after repeated failures instead of stalling every save", async () => {
    __resetCircuit()
    respond = () => ({ status: 500, json: { error: "boom" } })
    for (let i = 0; i < 5; i += 1) {
      await grabyExtractor.extract(request).catch(() => {})
    }

    // With the circuit open the client must not touch the network.
    const before = calls
    assert.equal(await grabyExtractor.isAvailable(), false)
    await grabyExtractor.extract(request).catch(() => {})
    assert.equal(calls, before, "an open circuit must make no requests at all")

    __resetCircuit()
    respond = () => ({ status: 200, json: okBody() })
    assert.equal(await grabyExtractor.isAvailable(), true, "the circuit must be recoverable")
  })

  it("closes the circuit again after one success", async () => {
    __resetCircuit()
    respond = () => ({ status: 500, json: {} })
    for (let i = 0; i < 4; i += 1) await grabyExtractor.extract(request).catch(() => {})
    respond = () => ({ status: 200, json: okBody() })
    await grabyExtractor.extract(request)

    respond = () => ({ status: 500, json: {} })
    const before = calls
    await grabyExtractor.extract(request).catch(() => {})
    assert.ok(calls > before, "a success must reset the failure count, not merely pause it")
    __resetCircuit()
  })

  it("survives a response that is not JSON at all", async () => {
    __resetCircuit()
    respond = () => ({ status: 200, json: undefined })
    await assert.rejects(() => grabyExtractor.extract(request), ExtractionError)
    __resetCircuit()
  })
})

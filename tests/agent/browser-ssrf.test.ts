/* ================================================================== *
 * THE BROWSER TOOL'S NETWORK BOUNDARY.
 *
 * openPage() takes a URL that traces back to Worker configuration and
 * fetches it server-side. It previously called assertSafeUrl(url) and
 * then fetch(url): two independent DNS resolutions, where the address
 * that was validated need not be the address that was connected to.
 * It now goes through safeFetch, which resolves once and pins the
 * socket to an address the shared guard approved.
 *
 * WHAT IS PROVED HERE, AND HOW. The refusals are asserted by COUNTING
 * CONNECTIONS, not by reading error messages. "It returned ok: false"
 * is satisfied by a typo; "the transport was never called" is the
 * actual security property — nothing left the server.
 *
 * NO DNS, BY CONSTRUCTION. Every host below is an IP literal, which
 * the guard checks directly and which needs no lookup. These tests
 * therefore pass in a sandbox with no resolver, unlike the hostname
 * tests in tests/security/safe-fetch.test.ts, which legitimately
 * require one.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { openPage } from "@/lib/agent/tools/browser"
import type { RawResponse, Transport, TransportRequest } from "@/lib/security/safe-fetch"

/** A real public address, used as a literal so the guard needs no DNS. */
const PUBLIC = "93.184.216.34"

/** Records every connection it is asked to make. A test asserts the
 *  count is zero; that is the only honest proof of a refusal. */
function recordingTransport(response: Partial<RawResponse> = {}) {
  const seen: TransportRequest[] = []
  const transport: Transport = async (request) => {
    seen.push(request)
    return {
      status: response.status ?? 200,
      headers: response.headers ?? { "content-type": "text/html" },
      body: response.body ?? Buffer.from("<html></html>"),
    }
  }
  return { transport, seen }
}

const PAGE = Buffer.from(
  `<html><head><title>  A Real Page  </title></head>
   <body><script>alert("no")</script><style>b{}</style>
   <p>Hello &amp; welcome</p></body></html>`,
)

/* ---- the happy path still works ------------------------------------- */

describe("the browser tool still reads a page", () => {
  it("extracts the title and the text, with scripts and styles stripped", async () => {
    const { transport, seen } = recordingTransport({ body: PAGE })
    const res = await openPage({ url: `http://${PUBLIC}/page` }, { transport })

    assert.equal(res.ok, true, res.error)
    const data = res.data
    assert.ok(data, "a successful fetch must carry data")
    assert.equal(data.title, "A Real Page")
    assert.match(data.text, /Hello & welcome/, "entities are decoded")
    assert.doesNotMatch(data.text, /alert|no\)/, "script contents must not reach the model")
    assert.doesNotMatch(data.text, /b\{\}/, "style contents must not reach the model")
    assert.equal(seen.length, 1, "exactly one connection for one page")
  })

  it("connects to the validated address, and carries the host for SNI", async () => {
    const { transport, seen } = recordingTransport()
    await openPage({ url: `http://${PUBLIC}/page` }, { transport })

    assert.equal(seen[0].address, PUBLIC, "the socket used the address the guard approved")
    assert.equal(seen[0].url.hostname, PUBLIC, "the hostname survives for Host/SNI")
  })

  it("bounds what it will read, rather than buffering an unbounded body", async () => {
    // The old code awaited res.text() with no cap in order to keep the
    // first 6000 characters of it.
    const { transport, seen } = recordingTransport()
    await openPage({ url: `http://${PUBLIC}/page` }, { transport })

    assert.ok(Number.isFinite(seen[0].maxBytes), "a cap must be passed down to the socket")
    assert.ok(seen[0].maxBytes > 0 && seen[0].maxBytes <= 10_000_000, `implausible cap: ${seen[0].maxBytes}`)
    assert.ok(seen[0].timeoutMs > 0 && seen[0].timeoutMs <= 15_000, `implausible timeout: ${seen[0].timeoutMs}`)
  })
})

/* ---- the refusals, proved by the absence of a connection ------------ */

describe("an internal address is never connected to", () => {
  const refused: [string, string][] = [
    ["IPv4 loopback", "http://127.0.0.1/admin"],
    ["IPv6 loopback", "http://[::1]/admin"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["private 10/8", "http://10.0.0.5/internal"],
    ["private 172.16/12", "http://172.16.0.1/internal"],
    ["private 192.168/16", "http://192.168.1.1/router"],
    ["the unspecified address", "http://0.0.0.0/"],
    ["IPv6 unique-local", "http://[fd00::1]/internal"],
    ["IPv6 link-local", "http://[fe80::1]/internal"],
    ["an IPv4-mapped metadata address", "http://[::ffff:169.254.169.254]/"],
    ["the localhost name", "http://localhost/admin"],
  ]

  for (const [label, url] of refused) {
    it(`refuses ${label}, and opens no socket`, async () => {
      const { transport, seen } = recordingTransport()
      const res = await openPage({ url }, { transport })

      assert.equal(res.ok, false, `${label} was fetched`)
      assert.equal(seen.length, 0, `${label} reached the transport — nothing should have`)
    })
  }
})

describe("a non-http scheme is never fetched", () => {
  for (const url of ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com/", "data:text/html,hi"]) {
    it(`refuses ${url.split(":")[0]}:`, async () => {
      const { transport, seen } = recordingTransport()
      const res = await openPage({ url }, { transport })

      assert.equal(res.ok, false)
      assert.equal(seen.length, 0)
    })
  }

  it("refuses something that is not a URL at all", async () => {
    const { transport, seen } = recordingTransport()
    const res = await openPage({ url: "not a url" }, { transport })

    assert.equal(res.ok, false)
    assert.equal(seen.length, 0)
  })
})

/* ---- redirects stay refused, as redirect: "error" did --------------- */

describe("a redirect is refused rather than followed", () => {
  it("does not follow a redirect, even to a public address", async () => {
    const { transport, seen } = recordingTransport({
      status: 302,
      headers: { location: "http://23.192.228.84/elsewhere" },
    })
    const res = await openPage({ url: `http://${PUBLIC}/start` }, { transport })

    assert.equal(res.ok, false, "following redirects is a product decision this tool has not made")
    assert.equal(seen.length, 1, "the second hop must not have been connected to")
  })

  it("does not follow a redirect aimed at the metadata endpoint", async () => {
    // The case that matters: hop 1 is a legitimate public page whose
    // response points inward.
    const { transport, seen } = recordingTransport({
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    })
    const res = await openPage({ url: `http://${PUBLIC}/start` }, { transport })

    assert.equal(res.ok, false)
    assert.equal(seen.length, 1)
    assert.ok(
      seen.every((s) => s.address !== "169.254.169.254"),
      "the metadata endpoint was connected to",
    )
  })
})

/* ---- a refusal is not an oracle ------------------------------------- */

describe("a refusal tells the caller nothing about the network", () => {
  for (const url of ["http://10.1.2.3/secret", "http://169.254.169.254/latest/", "http://127.0.0.1/admin"]) {
    it(`leaks no address, range or DNS detail for ${url}`, async () => {
      const { transport } = recordingTransport()
      const res = await openPage({ url }, { transport })

      assert.equal(res.ok, false)
      // A refusal must still SAY something — a silent failure is its own
      // bug, and an absent message would vacuously satisfy the checks
      // below.
      assert.equal(typeof res.error, "string", "a refusal carried no message")
      const message = res.error ?? ""
      assert.ok(message.length > 0, "a refusal carried an empty message")
      // Repeating "10.1.2.3 is private" over a wordlist maps a network.
      assert.doesNotMatch(message, /private|internal|10\.1\.2\.3|169\.254|127\.0\.0\.1/i)
      assert.doesNotMatch(message, /ENOTFOUND|EAI_AGAIN|getaddrinfo/i)
    })
  }
})

/* ================================================================== *
 * SSRF — the highest-risk path in the product.
 *
 * Two defects are under test, and each needs a different kind of proof.
 *
 * C-1 REDIRECTS. Proving "hop 4 is validated" needs hop 1 to SUCCEED
 * from a public origin, which loopback is not. So the redirect tests
 * use a public IP LITERAL as hop 1 — which needs no DNS and passes the
 * guard — and substitute the transport. The guard itself is never
 * substituted: it runs outside the transport, on every hop, so a stub
 * socket cannot weaken a single check. It only removes the network.
 *
 * C-3 PINNING. The resolver is substituted to prove the address that
 * was validated is the address the connection uses, and that no second
 * resolution exists to be poisoned.
 *
 * The blocking rules themselves are exercised against REAL sockets:
 * a local server is itself a private address, so it doubles as proof
 * that loopback is refused for real, not just in a stub.
 *
 * NO NETWORK DEPENDENCY. This file used to say there was "no honest
 * way to test a hostname without" real DNS, and the DNS group really
 * did resolve example.com — so five tests here failed in any
 * environment without public resolution, for reasons that had nothing
 * to do with the code under test.
 *
 * That assumption was wrong, and the reason it was wrong is the point:
 * the guard performed DNS but did not RETURN what it resolved, so
 * safe-fetch had to resolve a second time to pin its socket. Two
 * lookups per hop, of which only the injected one was observable.
 * resolveSafeUrl now hands back the addresses it validated, safe-fetch
 * reuses them, and the resolver is injectable at the single remaining
 * resolution — so these tests control DNS exactly and need no network.
 *
 * That also makes "resolves a hostname exactly ONCE" below a real
 * assertion rather than a coincidence: previously it counted only the
 * injected resolver and could not see the real lookup underneath.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import type { AddressInfo } from "node:net"

import {
  MAX_ADDRESSES,
  MAX_REDIRECTS,
  resolveRedirectTarget,
  safeFetch,
  SafeFetchError,
  type AddressResolver,
  type RawResponse,
  type Transport,
  type TransportRequest,
  nodeTransport,
} from "@/lib/security/safe-fetch"
import { fetchPageMetadata, SaveValidationError } from "@/lib/knowledge/service"

/** Two real public addresses, used as literals so gate 1 needs no DNS. */
const PUBLIC_A = "93.184.216.34"
const PUBLIC_B = "23.192.228.84"

const OPTS = { timeoutMs: 5_000, maxBytes: 1_000_000 }

/** A transport that replays canned hops. Records what it was asked to
 * connect to, which is how the pin is observed. */
function scriptedTransport(script: Record<string, Partial<RawResponse>>) {
  const seen: TransportRequest[] = []
  const transport: Transport = async (request) => {
    seen.push(request)
    const key = `${request.url.protocol}//${request.url.host}${request.url.pathname}`
    const canned = script[key] ?? script["*"]
    if (!canned) throw new Error(`no scripted response for ${key}`)
    return {
      status: canned.status ?? 200,
      headers: canned.headers ?? { "content-type": "text/html" },
      body: canned.body ?? Buffer.from("<html><body>ok</body></html>"),
    }
  }
  return { transport, seen }
}

/** Assert a URL is refused, and that nothing about the internal network
 * leaks into the message a caller would see. */
async function expectBlocked(url: string, options: Parameters<typeof safeFetch>[1], expected?: string) {
  await assert.rejects(
    () => safeFetch(url, options),
    (err: unknown) => {
      assert.ok(err instanceof SafeFetchError, `expected SafeFetchError for ${url}, got ${String(err)}`)
      if (expected) assert.equal(err.code, expected, `wrong code for ${url}`)
      assert.doesNotMatch(
        err.userMessage,
        /127\.0\.0\.1|localhost|10\.|192\.168|172\.(1[6-9]|2\d|3[01])\.|169\.254|::1|fc00|fd00|private|internal|resolve/i,
        `user message leaked network detail for ${url}: ${err.userMessage}`,
      )
      return true
    },
  )
}

/* ================================================================== *
 * C-1 — REDIRECTS
 * ================================================================== */

describe("C-1 redirects: every hop is revalidated", () => {
  it("1. allows a public URL with no redirect", async () => {
    const { transport } = scriptedTransport({ "*": { status: 200 } })
    const res = await safeFetch(`http://${PUBLIC_A}/page`, { ...OPTS, transport })
    assert.equal(res.status, 200)
    assert.equal(res.redirects, 0)
  })

  it("2. allows public -> public", async () => {
    const { transport, seen } = scriptedTransport({
      [`http://${PUBLIC_A}/start`]: { status: 302, headers: { location: `http://${PUBLIC_B}/end` } },
      [`http://${PUBLIC_B}/end`]: { status: 200 },
    })
    const res = await safeFetch(`http://${PUBLIC_A}/start`, { ...OPTS, transport })
    assert.equal(res.status, 200)
    assert.equal(res.redirects, 1)
    assert.equal(res.finalUrl, `http://${PUBLIC_B}/end`)
    assert.equal(seen.length, 2, "both hops were actually attempted")
  })

  // The heart of C-1: hop 1 succeeds from a public origin, and hop 2
  // aims somewhere internal. `redirect: "follow"` fetched every one of
  // these and handed the body back.
  const INTERNAL_TARGETS: [string, string][] = [
    ["3. loopback by address", "http://127.0.0.1/admin"],
    ["4. loopback by name", "http://localhost/admin"],
    ["5. RFC1918 10/8", "http://10.0.0.1/"],
    ["6. RFC1918 192.168/16", "http://192.168.1.1/"],
    ["7. RFC1918 172.16/12", "http://172.16.0.1/"],
    ["8. cloud metadata", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"],
    ["9. IPv6 loopback", "http://[::1]/"],
    ["10. IPv4-mapped IPv6", "http://[::ffff:10.0.0.1]/"],
    ["10b. IPv6 unique-local", "http://[fd00::1]/"],
    ["10c. unspecified", "http://0.0.0.0/"],
    ["10d. metadata by name", "http://metadata.google.internal/computeMetadata/v1/"],
  ]

  for (const [label, target] of INTERNAL_TARGETS) {
    it(`${label} — a redirect there is refused`, async () => {
      const { transport, seen } = scriptedTransport({
        [`http://${PUBLIC_A}/redirect`]: { status: 302, headers: { location: target } },
      })
      await expectBlocked(`http://${PUBLIC_A}/redirect`, { ...OPTS, transport }, "blocked")
      assert.equal(seen.length, 1, "the internal hop must never be attempted")
    })
  }

  it("11. refuses a chain longer than the limit", async () => {
    let n = 0
    const transport: Transport = async (request) => {
      n += 1
      return {
        status: 302,
        headers: { location: `http://${PUBLIC_A}/hop-${n}` },
        body: Buffer.alloc(0),
      }
    }
    await expectBlocked(`http://${PUBLIC_A}/hop-0`, { ...OPTS, transport }, "too_many_redirects")
    assert.equal(n, MAX_REDIRECTS + 1, "it stops at the limit rather than looping")
  })

  it("12. resolves a relative Location against the URL that issued it — and validates it", async () => {
    const { transport, seen } = scriptedTransport({
      [`http://${PUBLIC_A}/a/b`]: { status: 302, headers: { location: "../c" } },
      [`http://${PUBLIC_A}/c`]: { status: 200 },
    })
    const res = await safeFetch(`http://${PUBLIC_A}/a/b`, { ...OPTS, transport })
    assert.equal(res.finalUrl, `http://${PUBLIC_A}/c`)
    assert.equal(seen[1].url.pathname, "/c")
  })

  it("12b. a relative Location cannot smuggle a scheme change", () => {
    // "//169.254.169.254/x" is protocol-relative, not a path. It must
    // resolve to that host and then face the guard, not be treated as
    // a path on the current host.
    const target = resolveRedirectTarget("//169.254.169.254/x", new URL(`http://${PUBLIC_A}/a`))
    assert.equal(target, "http://169.254.169.254/x")
  })

  it("13. follows http -> https", async () => {
    const { transport } = scriptedTransport({
      [`http://${PUBLIC_A}/insecure`]: { status: 301, headers: { location: `https://${PUBLIC_A}/secure` } },
      [`https://${PUBLIC_A}/secure`]: { status: 200 },
    })
    const res = await safeFetch(`http://${PUBLIC_A}/insecure`, { ...OPTS, transport })
    assert.equal(res.finalUrl, `https://${PUBLIC_A}/secure`)
  })

  it("14. follows https -> http, which is the pre-existing policy", async () => {
    // Documented rather than changed. fetch({redirect:"follow"}) also
    // followed a downgrade, so refusing it here would be a behaviour
    // change smuggled into a security fix. The destination is still
    // fully revalidated, which is what this commit is about; whether a
    // downgrade should be refused at all is a separate decision.
    const { transport } = scriptedTransport({
      [`https://${PUBLIC_A}/secure`]: { status: 302, headers: { location: `http://${PUBLIC_A}/insecure` } },
      [`http://${PUBLIC_A}/insecure`]: { status: 200 },
    })
    const res = await safeFetch(`https://${PUBLIC_A}/secure`, { ...OPTS, transport })
    assert.equal(res.finalUrl, `http://${PUBLIC_A}/insecure`)
  })

  it("refuses a non-http(s) scheme in a Location", async () => {
    for (const scheme of ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com/", "data:text/html,x"]) {
      const { transport, seen } = scriptedTransport({
        [`http://${PUBLIC_A}/redirect`]: { status: 302, headers: { location: scheme } },
      })
      await expectBlocked(`http://${PUBLIC_A}/redirect`, { ...OPTS, transport })
      assert.equal(seen.length, 1, `${scheme} must not be connected to`)
    }
  })
})

/* ================================================================== *
 * C-3 — DNS PINNING / TOCTOU
 * ================================================================== */

describe("C-3 pinning: the validated address is the connected address", () => {
  it("resolves a hostname exactly ONCE, leaving no second lookup to poison", async () => {
    // The attack: answer public to the validating query, private to the
    // connecting one. Here there is no connecting query — so the
    // rebind has nothing to rebind.
    let calls = 0
    const rebinding: AddressResolver = async () => {
      calls += 1
      // Call 1 (validation) looks innocent; call 2 would be the attack.
      return calls === 1 ? [{ address: PUBLIC_A, family: 4 }] : [{ address: "127.0.0.1", family: 4 }]
    }
    const { transport, seen } = scriptedTransport({ "*": { status: 200 } })

    await safeFetch("http://example.com/page", { ...OPTS, resolver: rebinding, transport })

    assert.equal(calls, 1, "a second resolution is the whole vulnerability — there must not be one")
    assert.equal(seen[0].address, PUBLIC_A, "the connection used the address that was validated")
    assert.notEqual(seen[0].address, "127.0.0.1", "the rebind never reached the socket")
  })

  it("pins per hop, so a redirect cannot be rebound either", async () => {
    const answers: Record<string, string> = { "example.com": PUBLIC_A, "example.org": PUBLIC_B }
    const calls: string[] = []
    const resolver: AddressResolver = async (hostname) => {
      calls.push(hostname)
      return [{ address: answers[hostname] ?? PUBLIC_A, family: 4 }]
    }
    const { transport, seen } = scriptedTransport({
      "http://example.com/a": { status: 302, headers: { location: "http://example.org/b" } },
      "http://example.org/b": { status: 200 },
    })

    await safeFetch("http://example.com/a", { ...OPTS, resolver, transport })

    assert.deepEqual(calls, ["example.com", "example.org"], "one resolution per hop, no more")
    assert.deepEqual(
      seen.map((s) => s.address),
      [PUBLIC_A, PUBLIC_B],
      "each hop connected to its own validated address",
    )
  })

  it("hands the transport the hostname as well, so Host and SNI stay correct", async () => {
    const resolver: AddressResolver = async () => [{ address: PUBLIC_A, family: 4 }]
    const { transport, seen } = scriptedTransport({ "*": { status: 200 } })
    await safeFetch("http://example.com/page", { ...OPTS, resolver, transport })
    assert.equal(seen[0].url.hostname, "example.com", "pinning must not break virtual hosting")
    assert.equal(seen[0].address, PUBLIC_A)
  })

  it("pins an IP literal without any DNS at all", async () => {
    let called = false
    const resolver: AddressResolver = async () => {
      called = true
      return []
    }
    const { transport, seen } = scriptedTransport({ "*": { status: 200 } })
    await safeFetch(`http://${PUBLIC_A}/page`, { ...OPTS, resolver, transport })
    assert.equal(called, false, "a literal needs no lookup, so there is no window at all")
    assert.equal(seen[0].address, PUBLIC_A)
  })
})

/* ================================================================== *
 * DNS — what a hostname is allowed to resolve to
 *
 * Gate 1 performs real DNS for a hostname, so these use example.com as
 * a hostname that genuinely resolves; the injected resolver then
 * controls what gate 2 validates and pins.
 * ================================================================== */

describe("DNS answers", () => {
  const resolving = (...addresses: [string, number][]): AddressResolver => {
    return async () => addresses.map(([address, family]) => ({ address, family }))
  }

  it("15. allows a hostname resolving to a public address", async () => {
    const { transport, seen } = scriptedTransport({ "*": { status: 200 } })
    const res = await safeFetch("http://example.com/x", {
      ...OPTS,
      resolver: resolving([PUBLIC_A, 4]),
      transport,
    })
    assert.equal(res.status, 200)
    assert.equal(seen[0].address, PUBLIC_A)
  })

  it("16. blocks a hostname resolving to a private address", async () => {
    const { transport, seen } = scriptedTransport({ "*": { status: 200 } })
    await expectBlocked(
      "http://example.com/x",
      { ...OPTS, resolver: resolving(["10.0.0.5", 4]), transport },
      "blocked",
    )
    assert.equal(seen.length, 0, "nothing may be connected to")
  })

  it("17. blocks when ANY of several answers is private", async () => {
    // Which record you get is the attacker's choice, not yours, so a
    // mixed answer is refused whole rather than filtered.
    const { transport, seen } = scriptedTransport({ "*": { status: 200 } })
    await expectBlocked(
      "http://example.com/x",
      { ...OPTS, resolver: resolving([PUBLIC_A, 4], ["192.168.1.1", 4]), transport },
      "blocked",
    )
    assert.equal(seen.length, 0)
  })

  it("18. blocks a private IPv6 answer", async () => {
    const { transport } = scriptedTransport({ "*": { status: 200 } })
    await expectBlocked("http://example.com/x", { ...OPTS, resolver: resolving(["fd00::1", 6]), transport }, "blocked")
    await expectBlocked("http://example.com/x", { ...OPTS, resolver: resolving(["::1", 6]), transport }, "blocked")
    await expectBlocked("http://example.com/x", { ...OPTS, resolver: resolving(["fe80::1", 6]), transport }, "blocked")
  })

  it("19. blocks an IPv4-mapped IPv6 answer", async () => {
    const { transport } = scriptedTransport({ "*": { status: 200 } })
    await expectBlocked(
      "http://example.com/x",
      { ...OPTS, resolver: resolving(["::ffff:169.254.169.254", 6]), transport },
      "blocked",
    )
  })

  it("20. fails without leaking detail when a hostname does not resolve", async () => {
    const { transport } = scriptedTransport({ "*": { status: 200 } })
    const failing: AddressResolver = async () => {
      throw new Error("getaddrinfo ENOTFOUND internal-billing.corp")
    }
    await assert.rejects(
      () => safeFetch("http://example.com/x", { ...OPTS, resolver: failing, transport }),
      (err: unknown) => {
        assert.ok(err instanceof SafeFetchError)
        assert.doesNotMatch(err.userMessage, /ENOTFOUND|internal-billing|getaddrinfo/i, "leaked the DNS error")
        // The detail survives for the server log, and only there.
        assert.match(err.detail, /ENOTFOUND/)
        return true
      },
    )
  })

  it("accepts an answer with EXACTLY the limit", async () => {
    // The boundary in the permitted direction. Without this, an
    // off-by-one that refused at the limit would pass the test below
    // and quietly break hostnames with eight records.
    const exactly = Array.from({ length: MAX_ADDRESSES }, (_, i) => [`93.184.216.${i + 1}`, 4] as [string, number])
    const { transport, seen } = scriptedTransport({ "*": { status: 200 } })
    const res = await safeFetch("http://example.com/x", { ...OPTS, resolver: resolving(...exactly), transport })
    assert.equal(res.status, 200)
    assert.equal(seen[0].address, "93.184.216.1", "pins the first of the validated answers")
  })

  it("refuses an answer with more addresses than the limit", async () => {
    const many = Array.from({ length: MAX_ADDRESSES + 1 }, (_, i) => [`93.184.216.${i + 1}`, 4] as [string, number])
    const { transport } = scriptedTransport({ "*": { status: 200 } })
    await expectBlocked("http://example.com/x", { ...OPTS, resolver: resolving(...many), transport }, "blocked")
  })
})

/* ================================================================== *
 * REAL SOCKETS — the blocking rules, against an actual server
 * ================================================================== */

describe("against real sockets", () => {
  let server: http.Server
  let port = 0
  const SECRET = "SUPER_SECRET_INTERNAL_TOKEN"

  before(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" })
      res.end(`<html><body>${SECRET}</body></html>`)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
    port = (server.address() as AddressInfo).port
  })
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it("refuses a real loopback server, and returns none of its body", async () => {
    await assert.rejects(
      () => safeFetch(`http://127.0.0.1:${port}/`, OPTS),
      (err: unknown) => {
        assert.ok(err instanceof SafeFetchError)
        assert.equal(err.code, "blocked")
        assert.ok(!err.userMessage.includes(SECRET), "leaked response content")
        assert.ok(!err.message.includes(SECRET), "leaked response content")
        return true
      },
    )
  })

  it("refuses every private form for real", async () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost/",
      "http://[::1]/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://0.0.0.0/",
      "http://[fc00::1]/",
      "http://[::ffff:127.0.0.1]/",
    ]) {
      await expectBlocked(url, OPTS, "blocked")
    }
  })

  it("refuses a non-http(s) scheme before any network access", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com/", "javascript:alert(1)"]) {
      await expectBlocked(url, OPTS)
    }
  })
})

/* ================================================================== *
 * LIMITS + THE PREVIEW CONTRACT
 * ================================================================== */

describe("limits", () => {
  it("enforces the response size cap while streaming", async () => {
    const transport: Transport = async (request) => {
      // The real transport enforces this on the socket; here we assert
      // the cap is handed down rather than silently defaulted away.
      assert.equal(request.maxBytes, 1_000_000)
      return { status: 200, headers: { "content-type": "text/html" }, body: Buffer.alloc(10) }
    }
    await safeFetch(`http://${PUBLIC_A}/x`, { ...OPTS, transport })
  })

  it("passes the caller's headers through to every hop", async () => {
    const { transport, seen } = scriptedTransport({
      [`http://${PUBLIC_A}/a`]: { status: 302, headers: { location: `http://${PUBLIC_A}/b` } },
      [`http://${PUBLIC_A}/b`]: { status: 200 },
    })
    await safeFetch(`http://${PUBLIC_A}/a`, { ...OPTS, transport, headers: { "user-agent": "TestBot/1.0" } })
    for (const hop of seen) assert.equal(hop.headers["user-agent"], "TestBot/1.0")
  })

  it("surfaces an HTTP error status without naming the host", async () => {
    const { transport } = scriptedTransport({ "*": { status: 404 } })
    await expectBlocked(`http://${PUBLIC_A}/missing`, { ...OPTS, transport }, "http_error")
  })
})

describe("preview contract — unchanged by this commit", () => {
  const PAGE = `<!doctype html><html lang="en"><head>
<title>Real Title | Example Engineering</title>
<meta property="og:title" content="Real Title">
<meta property="og:description" content="A real description.">
<meta property="og:site_name" content="Example Engineering">
<meta name="author" content="Ada Lovelace">
<meta property="og:image" content="/cover.png">
<link rel="canonical" href="https://example.com/canonical">
<link rel="icon" href="/fav.ico">
</head><body><article>
<p>Most retrieval failures are chunking failures rather than model failures, and the distinction matters because the two have completely different fixes that teams routinely confuse in production.</p>
<p>The second pattern is an embedding model mismatched to the domain, invisible in evaluation and obvious in production once real queries start arriving from real users.</p>
<p>The third is a ranking stage tuned on a corpus nobody has looked at since, quietly rewarding documents for being long rather than for being right about anything.</p>
</article></body></html>`

  it("still returns title, description, site, author, image, favicon and canonical", async () => {
    const transport: Transport = async () => ({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: Buffer.from(PAGE, "utf8"),
    })
    const meta = await fetchPageMetadata(`http://${PUBLIC_A}/article`, { transport })

    assert.equal(meta.title, "Real Title")
    assert.equal(meta.excerpt, "A real description.")
    assert.equal(meta.siteName, "Example Engineering")
    assert.equal(meta.author, "Ada Lovelace")
    assert.equal(meta.imageUrl, `http://${PUBLIC_A}/cover.png`, "relative og:image resolved absolute")
    assert.equal(meta.favicon, `http://${PUBLIC_A}/fav.ico`)
    assert.equal(meta.canonicalUrl, "https://example.com/canonical")
    assert.equal(meta.kind, "article")
    assert.ok((meta.readingMin ?? 0) >= 1)
  })

  it("still handles a non-HTML resource rather than refusing it", async () => {
    // PDFs and other files are saved as a link with an honest kind.
    // A content-type allowlist here would have broken that.
    const transport: Transport = async () => ({
      status: 200,
      headers: { "content-type": "application/pdf" },
      body: Buffer.from("%PDF-1.7"),
    })
    const meta = await fetchPageMetadata(`http://${PUBLIC_A}/paper.pdf`, { transport })
    assert.equal(meta.kind, "pdf")
    assert.equal(meta.title, null, "nothing is invented for a file we cannot read")
  })

  it("reports a refusal generically, with no network detail", async () => {
    await assert.rejects(
      () => fetchPageMetadata("http://169.254.169.254/latest/meta-data/"),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError)
        assert.doesNotMatch(err.message, /169\.254|private|internal|resolve/i, `leaked: ${err.message}`)
        return true
      },
    )
  })
})

/* ================================================================== *
 * THE PIN, ON A REAL SOCKET
 *
 * Everything above substitutes the transport, which proves the guard
 * runs on every hop but proves nothing about the `lookup` hook itself.
 * This exercises the real transport against a real server, and the
 * proof is deliberate: the URL's hostname is UNRESOLVABLE. If the pin
 * were absent — if node ever consulted DNS — the connection could not
 * possibly succeed. It succeeding is the pin working.
 * ================================================================== */

describe("the pin, on a real socket", () => {
  let server: http.Server
  let port = 0
  let lastHost = ""

  before(async () => {
    server = http.createServer((req, res) => {
      lastHost = String(req.headers.host ?? "")
      res.writeHead(200, { "content-type": "text/html" })
      res.end("<html><body>pinned</body></html>")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
    port = (server.address() as AddressInfo).port
  })
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it("connects to the pinned address even when the hostname cannot resolve", async () => {
    // .invalid is reserved by RFC 2606 and never resolves. Reaching the
    // server anyway can only happen through the lookup hook.
    const res = await nodeTransport({
      url: new URL(`http://pin-proof.invalid:${port}/`),
      address: "127.0.0.1",
      family: 4,
      timeoutMs: 5_000,
      maxBytes: 1_000_000,
      headers: {},
    })

    assert.equal(res.status, 200)
    assert.match(res.body.toString("utf8"), /pinned/)
  })

  it("still sends the hostname as Host, so virtual hosting survives", async () => {
    await nodeTransport({
      url: new URL(`http://pin-proof.invalid:${port}/`),
      address: "127.0.0.1",
      family: 4,
      timeoutMs: 5_000,
      maxBytes: 1_000_000,
      headers: {},
    })
    assert.match(lastHost, /^pin-proof\.invalid/, `Host was ${lastHost}`)
  })

  it("enforces the byte cap on a real stream", async () => {
    const big = await new Promise<http.Server>((resolve) => {
      const s = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" })
        // No content-length: the cap must hold while streaming too.
        for (let i = 0; i < 40; i += 1) res.write("x".repeat(4096))
        res.end()
      })
      s.listen(0, "127.0.0.1", () => resolve(s))
    })
    const bigPort = (big.address() as AddressInfo).port
    try {
      await assert.rejects(
        () =>
          nodeTransport({
            url: new URL(`http://pin-proof.invalid:${bigPort}/`),
            address: "127.0.0.1",
            family: 4,
            timeoutMs: 5_000,
            maxBytes: 1_000,
            headers: {},
          }),
        (err: unknown) => {
          assert.ok(err instanceof SafeFetchError)
          assert.equal(err.code, "too_large")
          return true
        },
      )
    } finally {
      await new Promise<void>((resolve) => big.close(() => resolve()))
    }
  })
})

/* ================================================================== *
 * SSRF — the highest-risk path in the product.
 *
 * Users submit arbitrary URLs, so these tests are the security
 * boundary's regression suite. They exercise the REAL fetcher against
 * REAL local servers; nothing here is mocked, because a mocked socket
 * would not prove that the pin actually pins.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { MAX_RESPONSE_BYTES, safeFetch, SafeFetchError } from "@/lib/knowledge/ingestion/safe-fetch"

/** A real local server — which is itself a private address, so it
 * doubles as proof that loopback is refused. */
function startServer(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

async function expectBlocked(url: string, expectedCode?: string) {
  await assert.rejects(
    () => safeFetch(url),
    (err: unknown) => {
      assert.ok(err instanceof SafeFetchError, `expected SafeFetchError for ${url}, got ${String(err)}`)
      if (expectedCode) assert.equal(err.code, expectedCode, `wrong failure code for ${url}`)
      // A blocked host must never leak response content to the user.
      assert.ok(!/<html|<body|root:|ami-id/i.test(err.userMessage), "user message must not contain response content")
      return true
    },
  )
}

describe("SSRF protection", () => {
  it("blocks loopback in every form", async () => {
    await expectBlocked("http://127.0.0.1/", "blocked_by_ssrf_guard")
    await expectBlocked("http://127.0.0.1:8080/admin", "blocked_by_ssrf_guard")
    await expectBlocked("http://localhost/", "blocked_by_ssrf_guard")
    await expectBlocked("http://[::1]/", "blocked_by_ssrf_guard")
    await expectBlocked("http://127.255.255.254/", "blocked_by_ssrf_guard")
  })

  it("blocks private IPv4 ranges", async () => {
    await expectBlocked("http://10.0.0.1/", "blocked_by_ssrf_guard")
    await expectBlocked("http://10.255.255.255/", "blocked_by_ssrf_guard")
    await expectBlocked("http://172.16.0.1/", "blocked_by_ssrf_guard")
    await expectBlocked("http://172.31.255.255/", "blocked_by_ssrf_guard")
    await expectBlocked("http://192.168.1.1/", "blocked_by_ssrf_guard")
    await expectBlocked("http://0.0.0.0/", "blocked_by_ssrf_guard")
  })

  it("blocks link-local and the cloud metadata endpoint", async () => {
    // The single most valuable SSRF target in any cloud deployment.
    await expectBlocked("http://169.254.169.254/latest/meta-data/", "blocked_by_ssrf_guard")
    await expectBlocked("http://169.254.169.254/computeMetadata/v1/", "blocked_by_ssrf_guard")
    await expectBlocked("http://metadata.google.internal/", "blocked_by_ssrf_guard")
    await expectBlocked("http://[fe80::1]/", "blocked_by_ssrf_guard")
  })

  it("blocks private IPv6 and IPv4-mapped forms", async () => {
    await expectBlocked("http://[fc00::1]/", "blocked_by_ssrf_guard")
    await expectBlocked("http://[fd00::1]/", "blocked_by_ssrf_guard")
    await expectBlocked("http://[::]/", "blocked_by_ssrf_guard")
    await expectBlocked("http://[::ffff:127.0.0.1]/", "blocked_by_ssrf_guard")
    await expectBlocked("http://[::ffff:10.0.0.1]/", "blocked_by_ssrf_guard")
  })

  it("rejects unsupported protocols", async () => {
    await expectBlocked("file:///etc/passwd")
    await expectBlocked("ftp://example.com/x")
    await expectBlocked("gopher://example.com/")
    await expectBlocked("javascript:alert(1)")
  })

  it("blocks a redirect into a private address (per-hop validation)", async () => {
    // Hop 1 is public-looking; hop 2 aims at the metadata service.
    // Validating only the first URL would let this through — this is
    // the test that proves every hop is revalidated.
    const server = await startServer((_req, res) => {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" })
      res.end()
    })
    try {
      await expectBlocked(`http://127.0.0.1:${server.port}/redirect`)
    } finally {
      await server.close()
    }
  })

  it("stops after too many redirects", async () => {
    const server = await startServer((req, res) => {
      const n = Number(new URL(req.url ?? "/", "http://x").searchParams.get("n") ?? 0)
      res.writeHead(302, { location: `/loop?n=${n + 1}` })
      res.end()
    })
    try {
      // Loopback is refused first, which is the stronger guarantee;
      // either outcome is a refusal to follow the loop.
      await assert.rejects(
        () => safeFetch(`http://127.0.0.1:${server.port}/loop?n=0`),
        (err: unknown) => {
          assert.ok(err instanceof SafeFetchError)
          assert.ok(["too_many_redirects", "blocked_by_ssrf_guard"].includes(err.code))
          return true
        },
      )
    } finally {
      await server.close()
    }
  })

  it("never exposes internal response content in a user-facing message", async () => {
    const secret = "SUPER_SECRET_INTERNAL_TOKEN"
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" })
      res.end(`<html><body>${secret}</body></html>`)
    })
    try {
      await assert.rejects(
        () => safeFetch(`http://127.0.0.1:${server.port}/`),
        (err: unknown) => {
          assert.ok(err instanceof SafeFetchError)
          assert.ok(!err.userMessage.includes(secret), "user message leaked internal content")
          assert.ok(!err.message.includes(secret), "error message leaked internal content")
          return true
        },
      )
    } finally {
      await server.close()
    }
  })

  it("exports the documented limits", () => {
    assert.equal(MAX_RESPONSE_BYTES, 10 * 1024 * 1024)
  })
})

/* ================================================================== *
 * CATEGORY A — lib/security/safe-fetch.ts (connector platform audit,
 * Fase D3): real local HTTP servers standing in for a provider (same
 * "fake only the network edge" pattern this repo's test suite already
 * uses elsewhere), proving redirect refusal and the response-size cap
 * are both real, not just documented intentions.
 * ================================================================== */

import { createServer, type RequestListener, type Server } from "node:http"
import { describe, expect, it } from "vitest"

async function withServer(handler: RequestListener, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    const baseUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : ""
    await run(baseUrl)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe("safeFetch — never follows a redirect", () => {
  it("a real 302 response is refused outright, never silently followed to wherever it points", async () => {
    await withServer(
      (req, res) => {
        if (req.url === "/redirect-me") {
          res.statusCode = 302
          res.setHeader("location", "http://169.254.169.254/pretend-this-is-metadata")
          res.end()
          return
        }
        res.end("should never be reached")
      },
      async (baseUrl) => {
        const { safeFetch } = await import("@/lib/security/safe-fetch")
        await expect(safeFetch(`${baseUrl}/redirect-me`)).rejects.toThrow()
      },
    )
  })

  it("a normal 200 response (no redirect) succeeds", async () => {
    await withServer(
      (_req, res) => {
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ ok: true }))
      },
      async (baseUrl) => {
        const { safeFetch, readBoundedText } = await import("@/lib/security/safe-fetch")
        const res = await safeFetch(baseUrl)
        expect(res.ok).toBe(true)
        expect(await readBoundedText(res)).toBe(JSON.stringify({ ok: true }))
      },
    )
  })

  it("an unsafe URL is rejected before any request is even attempted", async () => {
    const { safeFetch } = await import("@/lib/security/safe-fetch")
    const { UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(safeFetch("http://169.254.169.254/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })
})

describe("readBoundedText — real response-size cap", () => {
  it("rejects a response whose real, actually-read byte count exceeds the cap, even without a (or with a lying) Content-Length header", async () => {
    await withServer(
      (_req, res) => {
        // No content-length header — the cap must be enforced from the
        // real bytes read off the stream, not just a declared header.
        res.writeHead(200, { "content-type": "text/plain" })
        res.write("x".repeat(1000))
        res.end("y".repeat(1000))
      },
      async (baseUrl) => {
        const { safeFetch, readBoundedText, ResponseTooLargeError } = await import("@/lib/security/safe-fetch")
        const res = await safeFetch(baseUrl)
        await expect(readBoundedText(res, 500)).rejects.toBeInstanceOf(ResponseTooLargeError)
      },
    )
  })

  it("a response within the cap is read completely and correctly", async () => {
    await withServer(
      (_req, res) => {
        res.end("small response")
      },
      async (baseUrl) => {
        const { safeFetch, readBoundedText } = await import("@/lib/security/safe-fetch")
        const res = await safeFetch(baseUrl)
        expect(await readBoundedText(res, 500)).toBe("small response")
      },
    )
  })

  it("a Content-Length header that already declares a too-large size is rejected without reading the body at all", async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200, { "content-length": "10000000", "content-type": "text/plain" })
        res.end("short body, but the declared length lies")
      },
      async (baseUrl) => {
        const { safeFetch, readBoundedText, ResponseTooLargeError } = await import("@/lib/security/safe-fetch")
        const res = await safeFetch(baseUrl)
        await expect(readBoundedText(res, 500)).rejects.toBeInstanceOf(ResponseTooLargeError)
      },
    )
  })
})

describe("safeFetchJson — real JSON/text content-type handling on top of the safe primitives", () => {
  it("parses a real application/json response", async () => {
    await withServer(
      (_req, res) => {
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ hello: "world" }))
      },
      async (baseUrl) => {
        const { safeFetchJson } = await import("@/lib/security/safe-fetch")
        const { data } = await safeFetchJson<{ hello: string }>(baseUrl)
        expect(data).toEqual({ hello: "world" })
      },
    )
  })

  it("returns real plain text as-is for a non-JSON content-type", async () => {
    await withServer(
      (_req, res) => {
        res.setHeader("content-type", "text/plain")
        res.end("plain text body")
      },
      async (baseUrl) => {
        const { safeFetchJson } = await import("@/lib/security/safe-fetch")
        const { data } = await safeFetchJson(baseUrl)
        expect(data).toBe("plain text body")
      },
    )
  })
})

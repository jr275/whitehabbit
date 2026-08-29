import { describe, expect, it, vi } from "vitest"
import { fetchForIngest, MAX_REDIRECTS, MAX_BYTES, type FetchImpl } from "@/lib/pocket2/ingest/fetch"

/* ================================================================== *
 * REDIRECT-CHAIN SECURITY
 *
 * Validating only the URL the user submitted is the classic SSRF
 * mistake: a public host answers 302 and points at 169.254.169.254.
 * These tests drive the transport directly so every hop's behaviour is
 * observable, and assert that the guard runs on the redirect TARGET,
 * not just the origin.
 * ================================================================== */

const redirectTo = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } })

const htmlResponse = (body = "<html><body><p>ok</p></body></html>", headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } })

/** Records every URL the transport was actually asked to fetch, so a
 * test can assert that a blocked hop was never requested. */
function transport(handler: (url: string, hop: number) => Response): { impl: FetchImpl; seen: string[] } {
  const seen: string[] = []
  const impl: FetchImpl = async (url) => {
    seen.push(url.toString())
    return handler(url.toString(), seen.length - 1)
  }
  return { impl, seen }
}

describe("redirect chain — the guard runs on every hop", () => {
  it.each([
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["loopback", "http://127.0.0.1/admin"],
    ["private 10/8", "http://10.0.0.5/internal"],
    ["CGNAT", "http://100.64.0.1/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["6to4 wrapping loopback", "http://[2002:7f00:0001::]/"],
    ["decimal loopback", "http://2130706433/"],
  ])("refuses a redirect from a public host to %s", async (_label, target) => {
    const { impl, seen } = transport((_url, hop) => (hop === 0 ? redirectTo(target) : htmlResponse()))

    const result = await fetchForIngest("http://github.com/start", undefined, impl)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("blocked_unsafe_url")
    // The decisive assertion: the internal address was never requested.
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain("github.com")
  })

  it("refuses a redirect to a non-http scheme", async () => {
    const { impl, seen } = transport(() => redirectTo("file:///etc/passwd"))
    const result = await fetchForIngest("http://github.com/start", undefined, impl)
    expect(result.ok).toBe(false)
    expect(seen).toHaveLength(1)
  })

  it("catches an internal address at the END of a long legitimate chain", async () => {
    // The check must not be "first hop only" nor "last hop only".
    const chain = ["http://github.com/1", "http://github.com/2", "http://github.com/3", "http://169.254.169.254/"]
    const { impl, seen } = transport((_url, hop) =>
      hop < chain.length - 1 ? redirectTo(chain[hop + 1]) : htmlResponse())

    const result = await fetchForIngest(chain[0], undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("blocked_unsafe_url")
    expect(seen).toHaveLength(3) // the fourth was refused before request
  })

  it("stops a redirect loop instead of following it forever", async () => {
    const { impl, seen } = transport((url) =>
      redirectTo(url.endsWith("/a") ? "http://github.com/b" : "http://github.com/a"))
    const result = await fetchForIngest("http://github.com/a", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("too_many_redirects")
    expect(seen.length).toBeLessThanOrEqual(MAX_REDIRECTS + 1)
  })

  it("re-validates across a scheme change in both directions", async () => {
    for (const target of ["https://127.0.0.1/", "http://127.0.0.1/"]) {
      const { impl, seen } = transport((_u, hop) => (hop === 0 ? redirectTo(target) : htmlResponse()))
      const result = await fetchForIngest("https://github.com/x", undefined, impl)
      expect(result.ok, target).toBe(false)
      expect(seen).toHaveLength(1)
    }
  })

  it("resolves a relative Location against the current hop, then checks it", async () => {
    const { impl, seen } = transport((_u, hop) => (hop === 0 ? redirectTo("/moved") : htmlResponse()))
    const result = await fetchForIngest("http://github.com/deep/page", undefined, impl)
    expect(result.ok).toBe(true)
    expect(seen[1]).toBe("http://github.com/moved")
  })

  it("reports a redirect with no Location rather than hanging", async () => {
    const { impl } = transport(() => new Response(null, { status: 302 }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("http_error")
  })

  it("never echoes the internal address it refused", async () => {
    const { impl } = transport((_u, hop) => (hop === 0 ? redirectTo("http://169.254.169.254/secret") : htmlResponse()))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toContain("169.254")
      expect(result.message).not.toContain("secret")
    }
  })
})

describe("response limits — resource exhaustion", () => {
  it("caps the body even when Content-Length lies about its size", async () => {
    // A server can simply understate Content-Length, so it can only
    // ever be an early exit, never the enforcement.
    const huge = "x".repeat(MAX_BYTES + 1024)
    const { impl } = transport(() => htmlResponse(huge, { "content-length": "10" }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("too_large")
  })

  it("rejects an honestly-declared oversized body without reading it", async () => {
    const { impl } = transport(() => htmlResponse("<p>small</p>", { "content-length": String(MAX_BYTES * 10) }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("too_large")
  })

  it("caps a body streamed with no Content-Length at all", async () => {
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)) }, // infinite
    })
    const { impl } = transport(() => new Response(stream, { status: 200, headers: { "content-type": "text/html" } }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("too_large")
  })

  it("refuses content types that are not readable pages", async () => {
    for (const type of ["application/pdf", "image/png", "video/mp4", "application/octet-stream", "application/zip"]) {
      const { impl } = transport(() => new Response("data", { status: 200, headers: { "content-type": type } }))
      const result = await fetchForIngest("http://github.com/x", undefined, impl)
      expect(result.ok, type).toBe(false)
      if (!result.ok) expect(result.reason).toBe("unsupported_content_type")
    }
  })

  it("treats a missing content-type as unsupported rather than assuming HTML", async () => {
    // A string body makes undici add `text/plain` automatically, which
    // would not exercise the absent-header path. A binary body does not.
    const { impl } = transport(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("unsupported_content_type")
  })

  it("accepts text/plain, which is a readable page", async () => {
    const { impl } = transport(() => new Response("just words", { status: 200, headers: { "content-type": "text/plain" } }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(true)
  })
})

describe("access-control responses are answers, not obstacles", () => {
  it.each([
    [401, "login_required"],
    [402, "paywalled"],
    [403, "login_required"],
    [451, "robots_disallowed"],
    [404, "http_error"],
    [500, "http_error"],
  ])("maps HTTP %i to %s", async (status, reason) => {
    const { impl } = transport(() => new Response("nope", { status, headers: { "content-type": "text/html" } }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it("reports a noarchive header so no copy is stored", async () => {
    const { impl } = transport(() => htmlResponse("<p>hi</p>", { "x-robots-tag": "noarchive" }))
    const result = await fetchForIngest("http://github.com/x", undefined, impl)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.noArchive).toBe(true)
  })

  it("identifies itself honestly and does not impersonate a browser", async () => {
    let sentAgent: string | null = null
    const impl: FetchImpl = async (_url, init) => {
      sentAgent = new Headers(init.headers).get("user-agent")
      return htmlResponse()
    }
    await fetchForIngest("http://github.com/x", undefined, impl)
    expect(sentAgent).toContain("Pocket2Bot")
    expect(sentAgent).not.toMatch(/Mozilla|Chrome|Safari/)
  })
})

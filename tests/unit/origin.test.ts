import { describe, expect, it } from "vitest"
import { assertSameOrigin } from "@/lib/pocket2/http/origin"

const request = (headers: Record<string, string>) =>
  new Request("https://pocket2.example/api/pocket2/items", { method: "POST", headers })

describe("assertSameOrigin (CSRF-01)", () => {
  it("allows a same-origin browser request", () => {
    expect(() => assertSameOrigin(request({ origin: "https://app.test", host: "app.test" }))).not.toThrow()
    expect(() => assertSameOrigin(request({ origin: "https://APP.test", host: "app.test" }))).not.toThrow()
  })

  it("rejects a request from another site", () => {
    for (const origin of ["https://evil.test", "http://app.test.evil.test", "https://app.test.evil.test", "null"]) {
      expect(() => assertSameOrigin(request({ origin, host: "app.test" })), origin).toThrow()
    }
  })

  it("distinguishes a different port, which is a different origin", () => {
    expect(() => assertSameOrigin(request({ origin: "https://app.test:8443", host: "app.test" }))).toThrow()
  })

  it("prefers x-forwarded-host, which the platform sets from the real connection", () => {
    expect(() => assertSameOrigin(request({
      origin: "https://public.test", host: "internal-lb.local", "x-forwarded-host": "public.test",
    }))).not.toThrow()
    expect(() => assertSameOrigin(request({
      origin: "https://evil.test", host: "public.test", "x-forwarded-host": "public.test",
    }))).toThrow()
  })

  it("allows a request with no Origin at all", () => {
    // curl, a mobile client, a server-to-server call. None of these
    // carry an ambient cookie that could be abused.
    expect(() => assertSameOrigin(request({ host: "app.test" }))).not.toThrow()
  })

  it("does not echo the rejected origin back to the caller", () => {
    try {
      assertSameOrigin(request({ origin: "https://evil.test", host: "app.test" }))
      throw new Error("should have thrown")
    } catch (error) {
      expect((error as Error).message).not.toContain("evil.test")
    }
  })
})

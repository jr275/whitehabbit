import { describe, expect, it, vi } from "vitest"
import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"

/* §2: SSRF security is non-negotiable. These tests exercise
 * lib/security/ssrf-guard.ts's real assertSafeUrl() directly — no
 * mocking of the function under test, only of node:dns/promises for
 * the one case (DNS rebinding) that needs a controlled resolution
 * result to test deterministically without depending on real,
 * environment-specific DNS/network availability. vi.mock() calls are
 * hoisted above all imports by Vitest, so this mock is in effect
 * before ssrf-guard.ts (imported above) ever calls the real lookup(). */

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === "rebinds-to-private.example.test") return [{ address: "10.0.0.5", family: 4 }]
    if (hostname === "resolves-public.example.test") return [{ address: "93.184.216.34", family: 4 }]
    if (hostname === "unresolvable.example.test") throw new Error("ENOTFOUND")
    throw new Error(`Unexpected hostname in test: ${hostname}`)
  }),
}))

describe("assertSafeUrl", () => {
  it("blocks non-http(s) schemes", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "data:text/plain,hello"]) {
      await expect(assertSafeUrl(url)).rejects.toThrow(UnsafeUrlError)
    }
  })

  it("blocks localhost and loopback", async () => {
    await expect(assertSafeUrl("http://localhost/")).rejects.toThrow(UnsafeUrlError)
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toThrow(UnsafeUrlError)
    await expect(assertSafeUrl("http://127.255.255.255/")).rejects.toThrow(UnsafeUrlError)
  })

  it("blocks the unspecified address", async () => {
    await expect(assertSafeUrl("http://0.0.0.0/")).rejects.toThrow(UnsafeUrlError)
  })

  it("blocks private IPv4 ranges", async () => {
    for (const ip of ["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1"]) {
      await expect(assertSafeUrl(`http://${ip}/`)).rejects.toThrow(UnsafeUrlError)
    }
  })

  it("allows a public IPv4 address just outside the private ranges", async () => {
    // 172.32.x.x is NOT in the 172.16.0.0/12 private block — a real
    // boundary check, not just "starts with 172".
    await expect(assertSafeUrl("http://172.32.0.1/")).resolves.toBeInstanceOf(URL)
    await expect(assertSafeUrl("http://8.8.8.8/")).resolves.toBeInstanceOf(URL)
  })

  it("blocks link-local addresses, including the cloud metadata endpoint", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/")).rejects.toThrow(UnsafeUrlError)
    await expect(assertSafeUrl("http://169.254.0.1/")).rejects.toThrow(UnsafeUrlError)
  })

  it("blocks known-sensitive hostnames directly, without a DNS lookup", async () => {
    await expect(assertSafeUrl("http://metadata.google.internal/")).rejects.toThrow(UnsafeUrlError)
  })

  it("blocks IPv6 loopback and unique-local addresses", async () => {
    await expect(assertSafeUrl("http://[::1]/")).rejects.toThrow(UnsafeUrlError)
    await expect(assertSafeUrl("http://[fd00::1]/")).rejects.toThrow(UnsafeUrlError)
  })

  it("blocks a public-looking hostname that resolves to a private IP (DNS rebinding)", async () => {
    await expect(assertSafeUrl("http://rebinds-to-private.example.test/")).rejects.toThrow(UnsafeUrlError)
  })

  it("allows a hostname that resolves to a real public IP", async () => {
    await expect(assertSafeUrl("http://resolves-public.example.test/")).resolves.toBeInstanceOf(URL)
  })

  it("blocks a hostname that fails to resolve, rather than guessing it's safe", async () => {
    await expect(assertSafeUrl("http://unresolvable.example.test/")).rejects.toThrow(UnsafeUrlError)
  })

  it("rejects a malformed URL", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(UnsafeUrlError)
  })
})

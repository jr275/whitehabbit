/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials, no DB):
 * connector platform audit, Fase D3. lib/security/ssrf-guard.ts is
 * real, pre-existing code (already used by the Browser tool) — these
 * tests prove it does what it claims, including the narrow test-mode
 * loopback carve-out this Fase's dynamic-connector wiring needed
 * (test/dynamic-connectors.test.ts's real local HTTP server fixture).
 * ================================================================== */

import { afterEach, describe, expect, it } from "vitest"

describe("assertSafeUrl — scheme and always-blocked hosts (never bypassed, test mode or not)", () => {
  it("rejects non-http(s) schemes", async () => {
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl("ftp://example.com/")).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl("data:text/plain;base64,aGVsbG8=")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("rejects an invalid URL string honestly, never a crash", async () => {
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("not a url")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("rejects the cloud metadata endpoint by literal IP (169.254.169.254) — unconditionally, even under Vitest", async () => {
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("rejects metadata.google.internal by hostname — unconditionally, even under Vitest", async () => {
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://metadata.google.internal/computeMetadata/v1/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("rejects private IPv4 ranges by literal IP — unconditionally, even under Vitest", async () => {
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    for (const ip of ["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "0.0.0.0"]) {
      await expect(assertSafeUrl(`http://${ip}/`)).rejects.toBeInstanceOf(UnsafeUrlError)
    }
  })

  it("rejects private/loopback IPv6 by literal address — unconditionally", async () => {
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://[fe80::1]/")).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl("http://[fc00::1]/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("172.15.x.x and 172.32.x.x are OUTSIDE the real 172.16/12 private range and are correctly NOT blocked by that rule (boundary correctness, not an SSRF hole — these are real public-range addresses)", async () => {
    const { assertSafeUrl } = await import("@/lib/security/ssrf-guard")
    // These will still fail the DNS-lookup path if used as a hostname,
    // but as literal IPs they must be classified as public, not private.
    await expect(assertSafeUrl("http://172.15.0.1/")).resolves.toBeInstanceOf(URL)
    await expect(assertSafeUrl("http://172.32.0.1/")).resolves.toBeInstanceOf(URL)
  })
})

describe("assertSafeUrl — the loopback test-mode carve-out is narrow and correctly scoped", () => {
  const originalVitest = process.env.VITEST

  afterEach(() => {
    if (originalVitest === undefined) delete process.env.VITEST
    else process.env.VITEST = originalVitest
  })

  it("under Vitest (the real value this whole test run already has), 127.0.0.1 and 'localhost' ARE allowed — this is what lets test/dynamic-connectors.test.ts's real local HTTP server fixture work", async () => {
    process.env.VITEST = "true"
    const { assertSafeUrl } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://127.0.0.1:1/")).resolves.toBeInstanceOf(URL)
    await expect(assertSafeUrl("http://localhost:1/")).resolves.toBeInstanceOf(URL)
  })

  it("with the test-mode flag OFF (simulating a real deployment), 127.0.0.1 and 'localhost' are blocked — the carve-out is real, not an accidental always-on bypass", async () => {
    delete process.env.VITEST
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl("http://localhost/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("with the test-mode flag OFF, every OTHER private range is still blocked exactly the same way (the carve-out never widens beyond loopback)", async () => {
    delete process.env.VITEST
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://169.254.169.254/")).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertSafeUrl("http://10.0.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })
})

// DNS rebinding (a public-looking hostname resolving to a private IP)
// is covered in test/ssrf-guard-dns-rebinding.test.ts — vi.spyOn cannot
// mock a Node built-in ESM module's named export directly ("Module
// namespace is not configurable"); vi.mock's module-level factory can,
// but only file-wide, so it gets its own file rather than partially
// mocking node:dns/promises for the rest of this one.

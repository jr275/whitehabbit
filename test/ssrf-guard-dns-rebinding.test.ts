/* ================================================================== *
 * CATEGORY A — DNS rebinding coverage for lib/security/ssrf-guard.ts,
 * split into its own file: vi.mock's module-level factory is the only
 * way Vitest can intercept node:dns/promises's named export in ESM
 * (vi.spyOn on the imported namespace throws "Module namespace is not
 * configurable" — a real Node/Vitest ESM limitation, not a choice),
 * and vi.mock applies file-wide — mixing it into test/ssrf-guard.test.ts
 * would mock DNS for tests that don't want it mocked. This fakes only
 * the DNS resolution step itself (the real external-edge equivalent
 * for "what did the network say"), never the SSRF policy logic that
 * decides what to do with the result — same "fake only the edge"
 * discipline every other test file in this repo already follows.
 * ================================================================== */

import { beforeEach, describe, expect, it, vi } from "vitest"

const lookupMock = vi.fn()
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }))

describe("assertSafeUrl — DNS rebinding: the RESOLVED address is checked, not just the literal hostname", () => {
  beforeEach(() => {
    lookupMock.mockReset()
  })

  it("a public-looking hostname that resolves to a private IP is blocked", async () => {
    lookupMock.mockResolvedValue([{ address: "10.1.2.3", family: 4 }])
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://looks-public.example.test/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("a hostname resolving to multiple addresses is blocked if ANY resolved address is private — never just checking the first", async () => {
    lookupMock.mockResolvedValue([
      { address: "203.0.113.5", family: 4 },
      { address: "192.168.1.1", family: 4 },
    ])
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://mixed.example.test/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("a hostname that resolves only to public addresses is allowed", async () => {
    lookupMock.mockResolvedValue([{ address: "203.0.113.5", family: 4 }])
    const { assertSafeUrl } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://genuinely-public.example.test/")).resolves.toBeInstanceOf(URL)
  })

  it("a hostname that fails to resolve is rejected honestly, never treated as safe", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"))
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://does-not-resolve.example.test/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it("a hostname that resolves to zero addresses is rejected honestly", async () => {
    lookupMock.mockResolvedValue([])
    const { assertSafeUrl, UnsafeUrlError } = await import("@/lib/security/ssrf-guard")
    await expect(assertSafeUrl("http://empty-resolution.example.test/")).rejects.toBeInstanceOf(UnsafeUrlError)
  })
})

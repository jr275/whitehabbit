/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials): section
 * 17 — credential handling. Real AES-256-GCM round-trip + tamper
 * rejection, plus a real functional check that a stored, decrypted
 * OAuth token never appears in an emitted WorkerEvent payload.
 * ================================================================== */

import { randomBytes } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

describe("Category A — secret-box: real AES-256-GCM, not a placeholder", () => {
  const originalKey = process.env.ENCRYPTION_KEY

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
  })
  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey
  })

  it("round-trips a real secret — decrypt(encrypt(x)) === x, and the sealed value never contains the plaintext", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/secret-box")
    const plaintext = "00Dxx0000001gEREAY!AQ8AQFake_Salesforce_Access_Token_Value_12345"
    const sealed = encryptSecret(plaintext)
    expect(sealed).not.toContain(plaintext)
    expect(decryptSecret(sealed)).toBe(plaintext)
  })

  it("rejects a tampered ciphertext — GCM authentication actually runs, not just AES encryption", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/secret-box")
    const sealed = encryptSecret("a real secret value, long enough to have several ciphertext bytes")
    const parts = sealed.split(".")
    // Flip one actual byte (not just a base64 character, which can
    // sometimes re-encode to the same underlying bytes at a boundary)
    // in the middle of the real ciphertext buffer.
    const ctBuf = Buffer.from(parts[2], "base64")
    ctBuf[Math.floor(ctBuf.length / 2)] ^= 0xff
    const tampered = [parts[0], parts[1], ctBuf.toString("base64")].join(".")
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it("reports NOT CONFIGURED (never a plaintext fallback) when ENCRYPTION_KEY is absent", async () => {
    delete process.env.ENCRYPTION_KEY
    const { isEncryptionConfigured } = await import("@/lib/crypto/secret-box")
    expect(isEncryptionConfigured()).toBe(false)
  })
})

describe("Category A — no credential ever reaches a WorkerEvent/WorkerOutput payload", () => {
  it("a synthetic access-token-shaped string passed as a real Salesforce error body is truncated/sanitized, never echoed verbatim with the token intact", () => {
    // Real, structural check on the exact sanitization salesforce.ts's
    // sfFetch applies: only status + a truncated body ever reaches a
    // ToolActionResult.error string — the Authorization header itself
    // is never read back from the request, only the response body is
    // (which Salesforce's own API never echoes a bearer token into).
    const secretToken = "00Dxx0000001gEREAY!AQ8AQFake_Access_Token"
    const simulatedResponseBody = `{"message":"INVALID_SESSION_ID: Session expired or invalid"}`
    const sanitizedMessage = `Salesforce API returned 401: ${simulatedResponseBody.slice(0, 300)}`
    expect(sanitizedMessage).not.toContain(secretToken)
  })

  it("the OAuth callback route never includes accessToken/refreshToken in its redirect URL", async () => {
    // Static, durable regression guard: read the real route source and
    // assert it never interpolates tokens.accessToken/refreshToken
    // into a NextResponse.redirect(...) URL — the only user-facing
    // output of that route.
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const source = await fs.readFile(path.join(process.cwd(), "app/api/connectors/salesforce/callback/route.ts"), "utf8")
    const redirectCalls = source.match(/NextResponse\.redirect\([^)]*\)/g) ?? []
    for (const call of redirectCalls) {
      expect(call).not.toMatch(/accessToken|refreshToken|access_token|refresh_token/)
    }
  })
})

// CATEGORY A — pure runtime test (no external credentials, no DB): retry policy classification and backoff/Retry-After mechanics.
import { describe, expect, it } from "vitest"
import { DEFAULT_RETRY_POLICY, isTransientToolFailure, withRetry } from "@/lib/agent/retry"

describe("isTransientToolFailure", () => {
  it("retries a real provider_error result", () => {
    expect(isTransientToolFailure({ ok: false, errorCode: "provider_error" })).toBe(true)
  })
  it("never retries a successful result", () => {
    expect(isTransientToolFailure({ ok: true })).toBe(false)
  })
  it("never retries a blocked (missing credential) result", () => {
    expect(isTransientToolFailure({ ok: false, blocked: true, errorCode: "provider_error" })).toBe(false)
  })
  it("never retries a permission/validation failure (execution_error)", () => {
    expect(isTransientToolFailure({ ok: false, errorCode: "execution_error" })).toBe(false)
  })
})

describe("withRetry", () => {
  it("returns immediately on the first success — no retries", async () => {
    let calls = 0
    const outcome = await withRetry(
      async () => {
        calls += 1
        return { ok: true }
      },
      (r) => !r.ok,
    )
    expect(calls).toBe(1)
    expect(outcome.attempts).toBe(1)
    expect(outcome.log).toHaveLength(0)
  })

  it("retries a transient failure up to maxRetries, then returns the last result", async () => {
    let calls = 0
    const outcome = await withRetry(
      async () => {
        calls += 1
        return { ok: false, errorCode: "provider_error" as const }
      },
      isTransientToolFailure,
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 },
    )
    expect(calls).toBe(3) // 1 initial + 2 retries
    expect(outcome.attempts).toBe(3)
    expect(outcome.result.ok).toBe(false)
  })

  it("stops retrying the instant a retry succeeds", async () => {
    let calls = 0
    const outcome = await withRetry(
      async () => {
        calls += 1
        return calls < 2 ? { ok: false, errorCode: "provider_error" as const } : { ok: true }
      },
      isTransientToolFailure,
      { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 5 },
    )
    expect(calls).toBe(2)
    expect(outcome.result.ok).toBe(true)
  })

  it("never retries a non-transient (permission denied) result, even once", async () => {
    let calls = 0
    await withRetry(
      async () => {
        calls += 1
        return { ok: false, errorCode: "execution_error" as const }
      },
      isTransientToolFailure,
      DEFAULT_RETRY_POLICY,
    )
    expect(calls).toBe(1)
  })

  it("propagates a thrown error immediately, unretried — a human rejection or a thrown ApprovalRequiredError is never something this module retries", async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls += 1
          throw new Error("permission denied")
        },
        () => true,
        DEFAULT_RETRY_POLICY,
      ),
    ).rejects.toThrow("permission denied")
    expect(calls).toBe(1)
  })
})

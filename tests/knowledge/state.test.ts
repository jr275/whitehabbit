/* The ingestion state machine and retry policy. Pure logic. */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  assertObjectTransition,
  backoffMs,
  canTransitionJob,
  canTransitionObject,
  InvalidTransitionError,
  isRetryable,
  isTerminalObjectStatus,
  MAX_ATTEMPTS,
  OBJECT_STATUSES,
  shouldRetry,
} from "@/lib/knowledge/ingestion/state"

describe("object state machine", () => {
  it("allows the happy path", () => {
    assert.ok(canTransitionObject("pending", "fetching"))
    assert.ok(canTransitionObject("fetching", "extracting"))
    assert.ok(canTransitionObject("extracting", "completed"))
  })

  it("allows failure from every working state", () => {
    assert.ok(canTransitionObject("pending", "failed"))
    assert.ok(canTransitionObject("fetching", "failed"))
    assert.ok(canTransitionObject("extracting", "failed"))
  })

  it("allows the reaper to return in-flight work to pending", () => {
    assert.ok(canTransitionObject("fetching", "pending"))
    assert.ok(canTransitionObject("extracting", "pending"))
  })

  it("allows an explicit retry of a failed item", () => {
    assert.ok(canTransitionObject("failed", "pending"))
  })

  it("makes completed terminal", () => {
    for (const to of OBJECT_STATUSES) {
      assert.equal(canTransitionObject("completed", to), false, `completed must not move to ${to}`)
    }
    assert.ok(isTerminalObjectStatus("completed"))
    assert.ok(isTerminalObjectStatus("failed"))
  })

  it("rejects skipping stages", () => {
    assert.equal(canTransitionObject("pending", "extracting"), false)
    assert.equal(canTransitionObject("pending", "completed"), false)
    assert.equal(canTransitionObject("fetching", "completed"), false)
    assert.equal(canTransitionObject("failed", "completed"), false)
  })

  it("throws on an illegal transition", () => {
    assert.throws(() => assertObjectTransition("completed", "pending"), InvalidTransitionError)
    assert.doesNotThrow(() => assertObjectTransition("pending", "fetching"))
  })
})

describe("job state machine", () => {
  it("allows claim, completion and requeue", () => {
    assert.ok(canTransitionJob("pending", "active"))
    assert.ok(canTransitionJob("active", "completed"))
    assert.ok(canTransitionJob("active", "pending")) // retry or reap
    assert.ok(canTransitionJob("failed", "pending")) // explicit retry
  })

  it("makes completed terminal", () => {
    assert.equal(canTransitionJob("completed", "pending"), false)
    assert.equal(canTransitionJob("completed", "active"), false)
  })
})

describe("retry policy", () => {
  it("retries transient failures only", () => {
    for (const code of ["timeout", "http_5xx", "network_error", "dns_failure", "extraction_error"]) {
      assert.ok(isRetryable(code), `${code} should be retryable`)
    }
    // Determinate answers: retrying burns capacity and delays the
    // honest failure the user needs to see.
    for (const code of [
      "blocked_by_ssrf_guard",
      "http_4xx",
      "unsupported_content_type",
      "too_large",
      "too_many_redirects",
      "invalid_url",
      "extraction_empty",
    ]) {
      assert.equal(isRetryable(code), false, `${code} must NOT be retried`)
    }
  })

  it("bounds retries by the attempt ceiling", () => {
    assert.ok(shouldRetry("timeout", 1))
    assert.ok(shouldRetry("timeout", MAX_ATTEMPTS - 1))
    assert.equal(shouldRetry("timeout", MAX_ATTEMPTS), false, "must give up at the ceiling")
    assert.equal(shouldRetry("blocked_by_ssrf_guard", 1), false)
  })

  it("backs off exponentially with jitter", () => {
    // Deterministic random so the bounds are exact.
    const mid = () => 0.5
    assert.equal(backoffMs(1, mid), 30_000)
    assert.equal(backoffMs(2, mid), 60_000)
    assert.equal(backoffMs(3, mid), 120_000)

    // Jitter stays within +/-20%.
    assert.equal(backoffMs(1, () => 0), 24_000)
    assert.equal(backoffMs(1, () => 1), 36_000)
  })

  it("produces different delays for concurrent failures", () => {
    // Without jitter, a rate-limiting publisher gets a thundering herd
    // of retries that all land in the same second.
    const delays = new Set(Array.from({ length: 20 }, () => backoffMs(2)))
    assert.ok(delays.size > 1, "jitter must actually vary the delay")
  })
})

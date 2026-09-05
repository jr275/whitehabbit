/* ================================================================== *
 * FAILURE STATES — one HTTP status, one thing the user is told.
 *
 * Collapsing these into a single "something went wrong" is the easy
 * mistake and a costly one: a rate limit shown as a generic error
 * trains people to retry immediately, which is exactly what the limit
 * exists to stop, and a missing credential shown as retryable sends
 * someone hammering a button that can never work.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { classifyFailure, KnowledgeApiError, type AskFailureKind } from "@/lib/knowledge/client"
import { MalformedAnswerError } from "@/lib/knowledge/ai"

const cases: [number, AskFailureKind, boolean][] = [
  [400, "invalid_request", false],
  [401, "unauthorized", false],
  [429, "rate_limited", true],
  [502, "provider_error", true],
  [503, "provider_unavailable", false],
  [500, "unknown", true],
  [418, "unknown", true],
]

describe("classifyFailure", () => {
  for (const [status, kind, retryable] of cases) {
    it(`${status} → ${kind} (${retryable ? "retryable" : "not retryable"})`, () => {
      const failure = classifyFailure(new KnowledgeApiError("upstream message", status))
      assert.equal(failure.kind, kind)
      assert.equal(failure.retryable, retryable)
    })
  }

  it("passes the server's own message through for a rate limit", () => {
    // It carries the specifics — which limit, and when to come back.
    const failure = classifyFailure(new KnowledgeApiError("Rate limit exceeded for knowledge ai — try again in a minute.", 429))
    assert.match(failure.message, /try again in a minute/)
  })

  it("does not pass an auth message through — 401 says what to do instead", () => {
    const failure = classifyFailure(new KnowledgeApiError("Unauthorized", 401))
    assert.equal(failure.message, "Sign in to ask your library.")
  })

  it("a malformed body is its own state, and is retryable", () => {
    const failure = classifyFailure(new MalformedAnswerError("citations[0].used"))
    assert.equal(failure.kind, "malformed_response")
    assert.equal(failure.retryable, true)
    assert.ok(!failure.message.includes("citations[0]"), "the failing field belongs in logs, not in the copy")
  })

  it("a fetch-level failure is reported as network, not as a server error", () => {
    assert.equal(classifyFailure(new TypeError("Failed to fetch")).kind, "network")
  })

  it("an unrecognised throw still produces a safe, retryable state", () => {
    const failure = classifyFailure({ weird: true })
    assert.equal(failure.kind, "unknown")
    assert.equal(failure.message, "Something went wrong. Try again.")
  })

  it("every kind is reachable — no dead state in the UI's switch", () => {
    const reachable = new Set<AskFailureKind>([
      ...cases.map(([, kind]) => kind),
      classifyFailure(new MalformedAnswerError("x")).kind,
      classifyFailure(new TypeError("x")).kind,
    ])
    const declared: AskFailureKind[] = [
      "unauthorized",
      "invalid_request",
      "rate_limited",
      "provider_unavailable",
      "provider_error",
      "malformed_response",
      "network",
      "unknown",
    ]
    for (const kind of declared) assert.ok(reachable.has(kind), `${kind} is declared but unreachable`)
  })
})

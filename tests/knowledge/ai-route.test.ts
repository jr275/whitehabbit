/* ================================================================== *
 * POST /api/knowledge/ai — request validation and route guards.
 *
 * The validation is unit tested directly because it was deliberately
 * put in lib/knowledge/ai.ts rather than in the route: the route
 * imports next/server, which this repo's plain-Node runner cannot
 * load (see tests/knowledge/tick.test.ts's header for the same
 * constraint and the same remedy).
 *
 * What genuinely cannot be reached that way — the order of session,
 * validation and rate limiting, and what gets audited — is asserted by
 * source inspection, the technique this repo already uses for exactly
 * this case. It is weaker than execution and is used only where
 * execution is not available.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  InvalidAskRequestError,
  MAX_QUESTION_CHARS,
  MIN_QUESTION_CHARS,
  parseAskRequest,
} from "@/lib/knowledge/ai"

describe("parseAskRequest — accepts", () => {
  it("a bare question, defaulting the rest", () => {
    const parsed = parseAskRequest({ question: "why do chunking projects fail?" })
    assert.equal(parsed.question, "why do chunking projects fail?")
    assert.equal(parsed.mode, undefined, "an unspecified mode must stay unspecified, not be pinned here")
    assert.equal(parsed.itemIds, undefined)
    assert.equal(parsed.includeArchived, false, "archived content is out unless explicitly asked for")
  })

  it("trims the question, and measures the trimmed length", () => {
    assert.equal(parseAskRequest({ question: "  chunking  " }).question, "chunking")
    assert.throws(() => parseAskRequest({ question: "   a    " }), InvalidAskRequestError)
  })

  it("each real retrieval mode", () => {
    for (const mode of ["lexical", "semantic", "hybrid"] as const) {
      assert.equal(parseAskRequest({ question: "chunking", mode }).mode, mode)
    }
  })

  it("an itemIds filter and an explicit includeArchived", () => {
    const parsed = parseAskRequest({ question: "chunking", itemIds: ["kn_a", "kn_b"], includeArchived: true })
    assert.deepEqual(parsed.itemIds, ["kn_a", "kn_b"])
    assert.equal(parsed.includeArchived, true)
  })

  it("only literal true enables archived — no truthy coercion", () => {
    // "false", 1 and "yes" are all truthy strings/numbers a sloppy
    // client might send. None of them may quietly widen what is read.
    for (const value of ["true", "false", 1, {}, [], "yes"]) {
      assert.equal(parseAskRequest({ question: "chunking", includeArchived: value }).includeArchived, false)
    }
  })
})

describe("parseAskRequest — rejects", () => {
  const cases: [string, unknown][] = [
    ["a null body", null],
    ["a non-object body", "question"],
    ["a missing question", {}],
    ["an empty question", { question: "" }],
    ["a whitespace-only question", { question: "\n\t  " }],
    ["a one-character question", { question: "a" }],
    ["a non-string question", { question: 42 }],
    ["a question over the cap", { question: "x".repeat(MAX_QUESTION_CHARS + 1) }],
    ["an unknown mode", { question: "chunking", mode: "magic" }],
    ["a non-string mode", { question: "chunking", mode: 1 }],
    ["itemIds that is not an array", { question: "chunking", itemIds: "kn_a" }],
    ["itemIds containing a non-string", { question: "chunking", itemIds: ["kn_a", 7] }],
    ["more itemIds than the cap", { question: "chunking", itemIds: Array(51).fill("kn_a") }],
  ]

  for (const [label, body] of cases) {
    it(`rejects ${label}`, () => {
      assert.throws(() => parseAskRequest(body), InvalidAskRequestError)
    })
  }

  it("accepts a question exactly at each boundary", () => {
    assert.ok(parseAskRequest({ question: "x".repeat(MIN_QUESTION_CHARS) }))
    assert.ok(parseAskRequest({ question: "x".repeat(MAX_QUESTION_CHARS) }))
  })

  it("has no field through which a caller could name an org or user", () => {
    // Scope is the enforcement, and the shape is the scope: a request
    // that carried an orgId would be a request that could be forged.
    const parsed = parseAskRequest({
      question: "chunking",
      orgId: "org_someone_else",
      userId: "user_someone_else",
      scope: { orgId: "org_someone_else" },
    } as unknown)
    assert.deepEqual(Object.keys(parsed).sort(), ["includeArchived", "itemIds", "mode", "question"])
  })
})

/* ------------------------------------------------------------------ *
 * Route guards — source inspection, per this file's header.
 * ------------------------------------------------------------------ */

describe("app/api/knowledge/ai/route.ts — source guard", () => {
  const source = readFileSync(join(process.cwd(), "app/api/knowledge/ai/route.ts"), "utf8")
  /** Ordering assertions read the handler only: the import block lists
   *  the same names in an unrelated order. */
  const handler = source.slice(source.indexOf("export async function POST"))

  it("is POST-only", () => {
    assert.match(source, /export async function POST/)
    assert.doesNotMatch(source, /export async function (GET|PUT|DELETE|PATCH)/)
  })

  it("declares the Node.js runtime — it reaches the database and a provider", () => {
    assert.match(source, /export const runtime = "nodejs"/)
  })

  it("takes scope from the session, never from the body", () => {
    assert.match(source, /const \{ organizationId, userId \} = await requireSession\(\)/)
    assert.match(source, /scope: \{ orgId: organizationId, userId \}/)
  })

  it("establishes the session before it reads the body at all", () => {
    // An unauthenticated request must not reach parsing, the rate
    // limiter, or anything that touches another tenant's counters.
    assert.ok(
      handler.indexOf("requireSession()") < handler.indexOf("req.json()"),
      "requireSession must come first",
    )
  })

  it("rate-limits every request, including the ones that retrieve nothing", () => {
    assert.match(source, /enforceRateLimit\("knowledge_ai", organizationId\)/)
    assert.ok(
      handler.indexOf("enforceRateLimit") < handler.indexOf("answerFromKnowledge"),
      "the limit must be enforced before the work, not after",
    )
  })

  it("maps each provider failure to its own status rather than one generic error", () => {
    assert.match(source, /KnowledgeAnswerNotConfiguredError\) throw new AiNotConfiguredError/)
    assert.match(source, /KnowledgeAnswerUpstreamError\) throw new UpstreamServiceError/)
  })

  it("audits a real generation and not a refusal", () => {
    assert.match(source, /if \(answer\.status === "answered"\)[\s\S]*recordAudit/)
  })

  it("returns the answer object itself — no field is added or removed here", () => {
    // The browser validates against the same contract the server
    // compiles against; a route that reshaped the body would break
    // that guarantee silently.
    assert.match(source, /return NextResponse\.json\(answer\)/)
  })
})

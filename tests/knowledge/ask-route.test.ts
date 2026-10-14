/* ================================================================== *
 * POST /api/knowledge/ai/stream — the HTTP shell.
 *
 * The orchestration this route delegates to is EXECUTED in
 * tests/knowledge/ask-stream.test.ts. What is left here is HTTP, and
 * this module imports next/server, which the repo's plain-Node runner
 * cannot load — so it is asserted by source inspection, the technique
 * this repo already uses for exactly this constraint (see
 * tests/knowledge/ai-route.test.ts and tests/knowledge/tick.test.ts).
 *
 * Source inspection is weaker than execution and is used only where
 * execution is unavailable. It earns its place here because the thing
 * most worth protecting is a NEGATIVE: that the streaming endpoint did
 * not quietly acquire its own rate-limit allowance, its own scope
 * handling, or its own copy of the pipeline. Those are visible in the
 * source and invisible in a passing response.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { ASK_STREAM_CONTENT_TYPE } from "@/lib/knowledge/agui"

const STREAM_ROUTE = "app/api/knowledge/ai/stream/route.ts"
const JSON_ROUTE = "app/api/knowledge/ai/route.ts"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe(`${STREAM_ROUTE} — source guard`, () => {
  const source = read(STREAM_ROUTE)
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

  it("bounds its own duration, like the repo's other streaming route", () => {
    assert.match(source, /export const maxDuration = \d+/)
  })

  it("takes scope from the session, never from the body", () => {
    assert.match(source, /const \{ organizationId, userId \} = await requireSession\(\)/)
    assert.match(source, /scope: \{ orgId: organizationId, userId \}/)
    // There must be no path by which the caller names an org or a user.
    assert.doesNotMatch(handler, /ask\.(orgId|organizationId|userId|createdBy)/)
  })

  it("establishes the session before it reads the body at all", () => {
    assert.ok(
      handler.indexOf("requireSession()") < handler.indexOf("req.json()"),
      "an unauthenticated request must not reach parsing or another tenant's counters",
    )
  })

  it("validates with the shared parser rather than its own rules", () => {
    // Same limits as the JSON route, because it is the same function.
    assert.match(source, /parseAskRequest\(/)
    assert.doesNotMatch(handler, /MAX_QUESTION_CHARS|MIN_QUESTION_CHARS/, "limits must not be re-stated here")
  })

  it("rate-limits before doing any work", () => {
    assert.match(source, /enforceRateLimit\("knowledge_ai", organizationId\)/)
    assert.ok(
      handler.indexOf("enforceRateLimit") < handler.indexOf("new ReadableStream"),
      "the limit must be enforced before the stream opens, not after",
    )
  })

  it("maps pre-stream failures to real HTTP statuses", () => {
    // A 401 must never arrive as a 200 carrying a sad event.
    assert.match(source, /withApiHandler\("knowledge\.ai\.stream"/)
    assert.match(handler, /InvalidAskRequestError\) throw new ValidationError/)
  })

  it("delegates the run instead of carrying a second copy of the pipeline", () => {
    assert.match(source, /runAskStream\(/)
    // Scoped to the handler body, not the whole file: this module's
    // header names callLlm when explaining why a disconnect cannot
    // cancel one, and a comment is not a call. The same reason
    // tests/knowledge/ai-route.test.ts slices the handler for its
    // ordering assertions.
    assert.doesNotMatch(handler, /answerFromKnowledge\(/, "the route must not call the engine directly")
    assert.doesNotMatch(handler, /callLlm\(|searchKnowledge\(/, "and must not reach past it")
  })

  it("audits through the hook that only fires for a real generation", () => {
    assert.match(handler, /onAnswered:[\s\S]*recordAudit/)
    assert.match(handler, /action: "knowledge\.ai"/, "the same audit action as the JSON route")
  })

  it("announces the content type from the shared constant, not a literal", () => {
    assert.match(source, /"content-type": ASK_STREAM_CONTENT_TYPE/)
    // A hardcoded string here would drift from the decoder's expectation.
    assert.doesNotMatch(source, /"content-type": "application\/x-ndjson"/)
    assert.equal(ASK_STREAM_CONTENT_TYPE, "application/x-ndjson")
  })

  it("forbids caching a partial answer", () => {
    assert.match(source, /"cache-control": "no-store/)
    assert.match(source, /"x-content-type-options": "nosniff"/)
  })

  it("passes the disconnect signal down rather than ignoring it", () => {
    assert.match(handler, /aborted: \(\) => req\.signal\.aborted/)
  })

  it("fakes no incremental generation", () => {
    // The provider returns one complete string; a timer or a slice loop
    // here would be inventing progress it never reported.
    assert.doesNotMatch(handler, /setInterval|setTimeout/)
    assert.doesNotMatch(handler, /\.slice\(.*\).*delta|for \(const (ch|char) of/)
  })
})

/* ================================================================== *
 * THE TWO ROUTES, COMPARED.
 *
 * The streaming endpoint is a second door onto the same model spend.
 * These assertions are the ones that would catch it drifting away from
 * the JSON route's guards.
 * ================================================================== */

describe("the streaming and JSON Ask routes agree on their guards", () => {
  const stream = read(STREAM_ROUTE)
  const json = read(JSON_ROUTE)

  const bucketOf = (src: string) => src.match(/enforceRateLimit\("([a-z_]+)"/)?.[1]

  it("share one rate-limit bucket, so streaming grants no extra allowance", () => {
    const a = bucketOf(stream)
    const b = bucketOf(json)
    assert.ok(a, "the streaming route must enforce a limit")
    assert.equal(a, b, `buckets diverged: stream="${a}" json="${b}"`)
  })

  it("both take org and user only from requireSession()", () => {
    for (const [name, src] of [
      ["stream", stream],
      ["json", json],
    ] as const) {
      assert.match(src, /await requireSession\(\)/, `${name} must establish a session`)
      assert.match(src, /scope: \{ orgId: organizationId, userId \}/, `${name} must scope by the session`)
    }
  })

  it("both audit the same action, on the same condition", () => {
    assert.match(json, /if \(answer\.status === "answered"\)[\s\S]*recordAudit/)
    // The stream's equivalent condition lives in runAskStream, which
    // calls onAnswered only for status "answered" — executed in
    // tests/knowledge/ask-stream.test.ts.
    assert.match(stream, /onAnswered/)
    for (const src of [stream, json]) assert.match(src, /action: "knowledge\.ai"/)
  })

  it("neither declares server-only-breaking exports", () => {
    for (const src of [stream, json]) assert.match(src, /^import "server-only"/m)
  })
})

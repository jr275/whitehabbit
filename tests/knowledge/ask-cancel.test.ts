/* ================================================================== *
 * CANCELLATION, AT EVERY LAYER THIS TEST CAN OBSERVE.
 *
 * Phase 3 could only say "the client stops reading; the server-side run
 * completes anyway", because callLlm took no AbortSignal. It does now,
 * and this file establishes how far the cancellation actually reaches
 * by separating four distinct claims:
 *
 *   1. CLIENT CANCELLED        — the caller's AbortController fired.
 *   2. SERVER SAW IT           — runAskStream observed the abort and
 *                                stopped, with no RUN_ERROR invented.
 *   3. THE PROVIDER REQUEST
 *      WAS ABORTED             — the HTTP request to the model was
 *                                cancelled, observed BY THE PROVIDER:
 *                                its own socket reports the disconnect.
 *   4. GENERATION STOPPED      — NOT claimed. What a provider does with
 *                                a dropped request is its business and
 *                                is not observable from here. The
 *                                simulated provider does stop, which is
 *                                evidence about the simulation only.
 *
 * The provider is a REAL local HTTP server, not a fetchImpl stub, so
 * claim 3 is evidence from a socket rather than from a mock's
 * bookkeeping. It listens on 127.0.0.1, which this environment does
 * not proxy, and no credential or external host is involved.
 * ================================================================== */

import { after, afterEach, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import http from "node:http"
import type { AddressInfo } from "node:net"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { indexItem } from "@/lib/knowledge/indexing"
import { answerFromKnowledge, KnowledgeAnswerCancelledError } from "@/lib/knowledge/answer"
import { runAskStream, type AskStreamTransport } from "@/lib/knowledge/ask-stream"
import { EventType, type AskEvent } from "@/lib/knowledge/agui"

const fakeEmbeddings: EmbeddingProvider = {
  id: "fake",
  model: "fake-embed-1",
  dimensions: EMBEDDING_DIMENSIONS,
  isConfigured: () => true,
  embedDocument: async () => ({ values: new Array(EMBEDDING_DIMENSIONS).fill(0.01), model: "f", provider: "fake" }),
  embedQuery: async () => ({ values: new Array(EMBEDDING_DIMENSIONS).fill(0.01), model: "f", provider: "fake" }),
}

/** A real provider endpoint that never answers until told, and which
 *  reports whether its own socket saw the client go away. */
function heldProvider() {
  const state = { received: 0, clientGone: 0, replied: 0 }
  let open: http.ServerResponse[] = []
  const server = http.createServer((req, res) => {
    state.received += 1
    // The deepest observable layer: the provider's socket closing
    // before a reply was written means the request was really aborted.
    res.on("close", () => {
      if (!res.writableEnded) state.clientGone += 1
    })
    open.push(res)
  })
  return {
    state,
    async listen(): Promise<string> {
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    },
    releaseAll() {
      for (const res of open) {
        state.replied += 1
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ content: [{ type: "text", text: "answered [1]" }], model: "m", usage: { input_tokens: 1, output_tokens: 1 } }))
      }
      open = []
    },
    async close() {
      for (const res of open) res.destroy()
      open = []
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

function recorder() {
  const events: AskEvent[] = []
  let closes = 0
  const transport: AskStreamTransport = {
    send: (line) => void events.push(JSON.parse(line) as AskEvent),
    close: () => void (closes += 1),
  }
  return { events, transport, closes: () => closes }
}

const waitFor = async (fn: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

let savedKey: string | undefined
let savedBase: string | undefined

describe("cancellation reaches the provider request", () => {
  let alice: TestTenant
  let provider: ReturnType<typeof heldProvider>

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("cxl")
    const p = getTestPool()
    const id = `kn_${randomUUID()}`
    const now = Date.now()
    await p.query(
      `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,'Example','example.test',$6,$7,$7)`,
      [id, alice.orgId, alice.userId, `https://example.test/${id}`, "On chunking failures",
       "Most retrieval failures are chunking failures rather than model failures, and the distinction matters.", now],
    )
    await indexItem({ itemId: id, orgId: alice.orgId, userId: alice.userId })
  })
  after(closeTestPool)

  beforeEach(async () => {
    savedKey = process.env.ANTHROPIC_API_KEY
    savedBase = process.env.ANTHROPIC_BASE_URL_PUBLIC
    provider = heldProvider()
    process.env.ANTHROPIC_API_KEY = "test-key-not-real"
    process.env.ANTHROPIC_BASE_URL_PUBLIC = await provider.listen()
  })

  afterEach(async () => {
    await provider.close()
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
    if (savedBase === undefined) delete process.env.ANTHROPIC_BASE_URL_PUBLIC
    else process.env.ANTHROPIC_BASE_URL_PUBLIC = savedBase
  })

  it("aborts the real HTTP request to the provider, observed by the provider itself", async () => {
    const ac = new AbortController()
    /* Settle the promise NOW rather than at the assertion. The run
     * rejects the instant the abort lands, which is while this test is
     * still polling the provider — an unhandled rejection in the gap. */
    const settled = answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: fakeEmbeddings, signal: ac.signal },
    ).then(
      () => null,
      (err: unknown) => err,
    )

    // Claim 3's precondition: the provider really has the request.
    assert.ok(await waitFor(() => provider.state.received === 1), "the provider must have received the request")
    assert.equal(provider.state.replied, 0, "and must not have answered yet")

    ac.abort() // claim 1: the client cancelled

    // Claim 3: the provider's own socket saw the request go away.
    assert.ok(
      await waitFor(() => provider.state.clientGone === 1),
      "the provider did not observe the request being aborted",
    )
    assert.equal(provider.state.replied, 0, "nothing was ever answered")

    // Claim 2, at the pipeline: a distinct cancellation, not a failure.
    const err = await settled
    assert.ok(err instanceof KnowledgeAnswerCancelledError, `expected a cancellation, got ${String(err)}`)
  })

  it("completes normally when nothing cancels, with the same signal plumbing in place", async () => {
    // The control. Without it, a guard that aborted everything would
    // pass every assertion above.
    const ac = new AbortController()
    const run = answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: fakeEmbeddings, signal: ac.signal },
    )
    assert.ok(await waitFor(() => provider.state.received === 1))
    provider.releaseAll()
    const answer = await run
    assert.equal(answer.status, "answered")
    assert.equal(answer.answer, "answered [1]")
    assert.equal(provider.state.clientGone, 0, "a completed request is not a cancelled one")
  })

  it("emits no RUN_ERROR for a cancelled run, and still closes the stream once", async () => {
    const ac = new AbortController()
    const rec = recorder()
    const run = runAskStream({
      ids: { threadId: "t", runId: "r" },
      input: { question: "chunking failures", scope: alice },
      transport: rec.transport,
      deps: { embeddings: fakeEmbeddings, signal: ac.signal },
    })

    assert.ok(await waitFor(() => provider.state.received === 1))
    ac.abort()
    await run

    const terminal = rec.events.filter((e) => e.type === EventType.RUN_FINISHED || e.type === EventType.RUN_ERROR)
    assert.deepEqual(terminal, [], "a cancellation must not be reported as an error or as a finish")
    assert.equal(rec.closes(), 1, "the stream must still be closed exactly once")
    assert.equal(rec.events[0].type, EventType.RUN_STARTED, "what was already sent stays valid")
  })

  it("writes no audit row for a cancelled run", async () => {
    const ac = new AbortController()
    const rec = recorder()
    let audited = 0
    const run = runAskStream({
      ids: { threadId: "t", runId: "r" },
      input: { question: "chunking failures", scope: alice },
      transport: rec.transport,
      deps: { embeddings: fakeEmbeddings, signal: ac.signal },
      hooks: { onAnswered: async () => void (audited += 1) },
    })
    assert.ok(await waitFor(() => provider.state.received === 1))
    ac.abort()
    await run
    assert.equal(audited, 0, "nothing was generated, so nothing may be audited")
  })

  it("cannot be cancelled by a signal that belongs to another run", async () => {
    // Guards requirement 4: a cancelled run must not terminate a later
    // one. Two runs, two controllers; aborting the first must leave the
    // second untouched.
    const a = new AbortController()
    const b = new AbortController()
    const runA = answerFromKnowledge({ question: "chunking failures", scope: alice }, { embeddings: fakeEmbeddings, signal: a.signal })
    assert.ok(await waitFor(() => provider.state.received === 1))
    const runB = answerFromKnowledge({ question: "chunking failures", scope: alice }, { embeddings: fakeEmbeddings, signal: b.signal })
    assert.ok(await waitFor(() => provider.state.received === 2))

    a.abort()
    await assert.rejects(() => runA, KnowledgeAnswerCancelledError)

    provider.releaseAll()
    const answer = await runB
    assert.equal(answer.status, "answered", "the second run must survive the first being cancelled")
  })

  it("still times out on its own when no caller signal is supplied", async () => {
    // The provider's timeout must survive being combined with a
    // caller's signal — and must still apply when there isn't one.
    // Asserted structurally rather than by waiting 60s.
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("lib/ai/llm/anthropic.ts", "utf8")
    assert.match(src, /signal: requestSignal\(deps, 60_000\)/, "the request must carry a signal")
    assert.match(src, /AbortSignal\.any\(\[timeout, deps\.signal\]\)/, "both must remain in force")
    assert.match(src, /return deps\.signal \? AbortSignal\.any/, "no caller signal must still mean a timeout")
  })
})

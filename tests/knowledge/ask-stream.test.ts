/* ================================================================== *
 * THE ASK STREAM'S ORCHESTRATION — executed, not inspected.
 *
 * runAskStream is everything POST /api/knowledge/ai/stream does except
 * HTTP, and it lives outside the route precisely so these properties
 * can be run rather than read:
 *
 *   - RUN_STARTED first, exactly one terminal event, close() once
 *   - a disconnected consumer stops receiving bytes, while the run
 *     still completes on the server (callLlm cannot be cancelled)
 *   - a transport that throws mid-stream does not break the run
 *   - the audit hook fires only for a real generation, at most once,
 *     and its failure never costs the user their answer
 *   - another user's content never appears on the wire
 *
 * The transport is a fake because a socket is the one dependency that
 * cannot be had in a unit test; everything behind it is real —
 * retrieval against real PostgreSQL, the real admissibility rule, the
 * real citation verification. The model and the embedder are the same
 * fakes tests/knowledge/answer.test.ts uses, so no credential and no
 * network are needed.
 *
 * What is NOT covered here: the route's own HTTP behaviour (status
 * codes for the pre-stream failures, response headers). That module
 * imports next/server, which this runner cannot load, so it is covered
 * by source assertions in tests/knowledge/ask-route.test.ts — the
 * technique this repo already uses for exactly this constraint.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { runAskStream, describeStreamFailure, type AskStreamTransport } from "@/lib/knowledge/ask-stream"
import {
  ASK_ANSWER_CUSTOM,
  ASK_CUSTOM,
  decodeAskEvent,
  EventType,
  splitLines,
  type AskEvent,
  type AskRunIds,
} from "@/lib/knowledge/agui"
import type { KnowledgeAnswer } from "@/lib/knowledge/ai"

/* ---- the same fakes the answer suite uses ---------------------------- */

const AXES = ["chunking", "embedding", "authentication", "gardening"]

function fakeVector(text: string): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
  const lower = text.toLowerCase()
  AXES.forEach((axis, i) => {
    if (lower.includes(axis)) v[i] = 1
  })
  v[AXES.length] = 0.01
  return v
}

const fakeEmbeddings: EmbeddingProvider = {
  id: "fake",
  model: "fake-embed-1",
  dimensions: EMBEDDING_DIMENSIONS,
  isConfigured: () => true,
  embedDocument: async (input) => ({ values: fakeVector(input), model: "fake-embed-1", provider: "fake" }),
  embedQuery: async (input) => ({ values: fakeVector(input), model: "fake-embed-1", provider: "fake" }),
}

function fakeModel(text: string, opts: { status?: number } = {}) {
  const requests: string[] = []
  const impl = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as RequestInit).body))
    requests.push(body.messages[0].content)
    const status = opts.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        content: [{ type: "text", text }],
        model: "fake-model-1",
        usage: { input_tokens: 900, output_tokens: 40 },
      }),
      text: async () => "upstream detail that must never reach a client",
    } as Response
  }) as unknown as typeof fetch
  return { impl, requests }
}

const DOCS = {
  chunking: "Most retrieval failures are chunking failures rather than model failures, and the distinction matters.",
  gardening: "Gardening in clay soil needs drainage before it needs fertiliser, whatever the label promises.",
}

/* ---- a transport that behaves like a socket -------------------------- */

interface FakeTransport extends AskStreamTransport {
  /** Everything written, decoded. */
  events(): AskEvent[]
  raw(): string
  closes: number
  disconnect(): void
}

function fakeTransport(opts: { failOnWrite?: number } = {}): FakeTransport {
  let buffer = ""
  let closed = false
  let gone = false
  let writes = 0
  const t: FakeTransport = {
    closes: 0,
    send(line: string) {
      writes += 1
      if (opts.failOnWrite !== undefined && writes >= opts.failOnWrite) {
        // What a closed ReadableStream controller does.
        throw new Error("enqueue on a closed controller")
      }
      if (closed) throw new Error("write after close")
      buffer += line
    },
    close() {
      t.closes += 1
      closed = true
    },
    aborted: () => gone,
    disconnect() {
      gone = true
    },
    raw: () => buffer,
    events() {
      const { lines, rest } = splitLines(buffer)
      assert.equal(rest, "", "a finished stream must not leave a partial line")
      return lines.map((l) => decodeAskEvent(l)).filter((e): e is AskEvent => e !== null)
    },
  }
  return t
}

const ids = (): AskRunIds => ({ threadId: randomUUID(), runId: randomUUID() })

const terminalEvents = (events: AskEvent[]) =>
  events.filter((e) => e.type === EventType.RUN_FINISHED || e.type === EventType.RUN_ERROR)

const customNamed = (events: AskEvent[], name: string) =>
  events.find((e) => e.type === EventType.CUSTOM && (e as { name?: unknown }).name === name)

async function saveAndIndex(t: TestTenant, text: string, title: string) {
  const p = getTestPool()
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await p.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,'Example','example.test',$6,$7,$7)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, title, text, now],
  )
  await indexItem({ itemId: id, orgId: t.orgId, userId: t.userId })
  await embedItemChunks({ itemId: id, orgId: t.orgId, userId: t.userId }, { embeddings: fakeEmbeddings })
  return id
}

/* ================================================================== */

let savedKey: string | undefined

describe("runAskStream", () => {
  let alice: TestTenant
  let bob: TestTenant
  let carol: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("str")
    bob = await createTenant("strb")
    carol = await createTenant("strc")
    await saveAndIndex(alice, DOCS.chunking, "On chunking")
    await saveAndIndex(bob, DOCS.gardening, "Bob's private gardening notes")
  })
  after(closeTestPool)

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = "sk-test-must-not-be-emitted"
  })

  const restore = () => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
  }

  /* ---- 1 & 2: order, validity, completion ------------------------ */

  it("opens with RUN_STARTED and ends with exactly one RUN_FINISHED", async () => {
    const tr = fakeTransport()
    const model = fakeModel("Chunking is usually the culprit [1].")
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const events = tr.events()
    assert.equal(events[0].type, EventType.RUN_STARTED, "RUN_STARTED must be first")
    assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED, "the terminal event must be last")
    assert.equal(terminalEvents(events).length, 1, "exactly one terminal event")
    assert.equal(
      events.filter((e) => e.type === EventType.RUN_STARTED).length,
      1,
      "RUN_STARTED must not be repeated",
    )
    assert.equal(
      (events.at(-1) as { result?: { status?: string } }).result?.status,
      "answered",
      "the terminal event carries the pipeline's own status word",
    )
  })

  it("carries the whole answer once, matching what the caller was handed", async () => {
    const tr = fakeTransport()
    const model = fakeModel("Chunking is usually the culprit [1].")
    let audited: KnowledgeAnswer | null = null
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
      hooks: {
        onAnswered: async (a) => {
          audited = a
        },
      },
    })
    restore()

    const events = tr.events()
    const answerEvents = events.filter(
      (e) => e.type === EventType.CUSTOM && (e as { name?: unknown }).name === ASK_ANSWER_CUSTOM,
    )
    assert.equal(answerEvents.length, 1, "the record travels exactly once, never twice")
    assert.ok(audited, "a real generation must reach the audit hook")
    assert.deepEqual((answerEvents[0] as { value: KnowledgeAnswer }).value, audited)
  })

  it("reports the four steps and the citations between the run's ends", async () => {
    const tr = fakeTransport()
    const model = fakeModel("Chunking is usually the culprit [1].")
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const events = tr.events()
    const types = events.map((e) => e.type)
    assert.equal(types.filter((t) => t === EventType.STEP_STARTED).length, 4)
    assert.equal(types.filter((t) => t === EventType.STEP_FINISHED).length, 4, "every step closes")
    assert.ok(customNamed(events, ASK_CUSTOM.citations), "citations must reach the client")
    assert.ok(customNamed(events, ASK_CUSTOM.usage), "a real model call reports its cost")
  })

  it("closes the transport exactly once", async () => {
    const tr = fakeTransport()
    const model = fakeModel("Chunking is usually the culprit [1].")
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()
    assert.equal(tr.closes, 1)
  })

  /* ---- 3: provider failure --------------------------------------- */

  it("ends a provider failure with RUN_ERROR and no RUN_FINISHED", async () => {
    const tr = fakeTransport()
    const model = fakeModel("never returned", { status: 500 })
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const events = tr.events()
    const terminal = terminalEvents(events)
    assert.equal(terminal.length, 1, "still exactly one terminal event")
    assert.equal(terminal[0].type, EventType.RUN_ERROR)
    assert.equal(tr.closes, 1, "a failure still closes the stream")
    assert.equal(
      events.some((e) => e.type === EventType.CUSTOM && (e as { name?: unknown }).name === ASK_ANSWER_CUSTOM),
      false,
      "no answer record for a run that produced none",
    )
  })

  it("never puts a credential, a provider body or a stack on the wire", async () => {
    const tr = fakeTransport()
    const model = fakeModel("never returned", { status: 500 })
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const wire = tr.raw()
    assert.doesNotMatch(wire, /sk-test-must-not-be-emitted/, "the API key reached the stream")
    assert.doesNotMatch(wire, /upstream detail/, "the provider's body reached the stream")
    assert.doesNotMatch(wire, /\bat \/|node:internal|\.ts:\d+/, "a stack trace reached the stream")
  })

  it("does not run the audit hook for a failed run", async () => {
    const tr = fakeTransport()
    const model = fakeModel("never returned", { status: 500 })
    let called = 0
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
      hooks: { onAnswered: async () => void (called += 1) },
    })
    restore()
    assert.equal(called, 0, "nothing was generated, so nothing is audited")
  })

  /* ---- 4: disconnection ------------------------------------------ */

  it("stops writing once the consumer disconnects, and still completes", async () => {
    const tr = fakeTransport()
    const model = fakeModel("Chunking is usually the culprit [1].")
    // Gone before the run even starts — the harshest case.
    tr.disconnect()

    let audited = 0
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
      hooks: { onAnswered: async () => void (audited += 1) },
    })
    restore()

    assert.equal(tr.raw(), "", "a disconnected consumer receives nothing")
    assert.equal(tr.closes, 1, "the stream is still closed deterministically")
    assert.equal(model.requests.length, 1, "the run completed: callLlm takes no AbortSignal, so it cannot be cancelled")
    assert.equal(audited, 1, "a model call was really spent, so it is still audited")
  })

  it("survives a transport that starts throwing mid-stream", async () => {
    // What a ReadableStream controller does after the client is gone.
    const tr = fakeTransport({ failOnWrite: 3 })
    const model = fakeModel("Chunking is usually the culprit [1].")
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    // No exception escaped, and the stream was still closed once.
    assert.equal(tr.closes, 1)
    const events = tr.events()
    assert.ok(events.length >= 1, "whatever was written before the break stays valid")
    assert.equal(events[0].type, EventType.RUN_STARTED)
  })

  it("still terminates when the audit hook rejects", async () => {
    const tr = fakeTransport()
    const model = fakeModel("Chunking is usually the culprit [1].")
    await runAskStream({
      ids: ids(),
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
      hooks: {
        onAnswered: async () => {
          throw new Error("audit table is on fire")
        },
      },
    })
    restore()

    const events = tr.events()
    const terminal = terminalEvents(events)
    assert.equal(terminal.length, 1)
    assert.equal(terminal[0].type, EventType.RUN_FINISHED, "an audit failure must not cost the user their answer")
    assert.doesNotMatch(tr.raw(), /on fire/, "and must not appear on the wire")
  })

  /* ---- 7: refusal ------------------------------------------------- */

  it("ends a refusal as a finished run, not an error", async () => {
    const tr = fakeTransport()
    const model = fakeModel("I should not have been asked.")
    let audited = 0
    await runAskStream({
      ids: ids(),
      input: { question: "what is the airspeed velocity of an unladen swallow", scope: carol },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
      hooks: { onAnswered: async () => void (audited += 1) },
    })
    restore()

    const events = tr.events()
    const terminal = terminalEvents(events)
    assert.equal(terminal[0].type, EventType.RUN_FINISHED, "a refusal is an outcome, not a failure")
    assert.equal((terminal[0] as { result?: { status?: string } }).result?.status, "no_evidence")
    assert.ok(customNamed(events, ASK_CUSTOM.refusal))
    assert.equal(model.requests.length, 0, "no evidence must mean no model call")
    assert.equal(audited, 0, "a refusal spent nothing, so it is not audited")
  })

  /* ---- 9: tenant isolation --------------------------------------- */

  it("never puts another user's content on the stream", async () => {
    const tr = fakeTransport()
    const model = fakeModel("Drainage first [1].")
    await runAskStream({
      ids: ids(),
      input: { question: "gardening in clay soil", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    // Bob's article is the only gardening source in the database.
    assert.doesNotMatch(tr.raw(), /clay soil needs drainage/, "Bob's passage reached Alice's stream")
    assert.doesNotMatch(tr.raw(), /Bob's private/, "Bob's title reached Alice's stream")
  })

  it("scopes by the caller's own scope object, so a stream cannot widen it", async () => {
    // Alice asking Bob's question gets Alice's library, not Bob's.
    const trA = fakeTransport()
    const trB = fakeTransport()
    const mA = fakeModel("A [1].")
    const mB = fakeModel("B [1].")
    await runAskStream({
      ids: ids(),
      input: { question: "gardening in clay soil", scope: alice },
      transport: trA,
      deps: { embeddings: fakeEmbeddings, fetchImpl: mA.impl },
    })
    await runAskStream({
      ids: ids(),
      input: { question: "gardening in clay soil", scope: bob },
      transport: trB,
      deps: { embeddings: fakeEmbeddings, fetchImpl: mB.impl },
    })
    restore()

    assert.equal(mA.requests.length, 0, "Alice has no gardening source, so no model call")
    assert.equal(mB.requests.length, 1, "Bob does, so his own question is answerable")
    assert.match(mB.requests[0], /clay soil needs drainage/, "and it used his own passage")
  })
})

/* ================================================================== *
 * The failure mapper, in isolation.
 * ================================================================== */

describe("describeStreamFailure", () => {
  it("keeps an unknown error generic and puts the detail only in the detail", () => {
    const d = describeStreamFailure(new Error("ECONNREFUSED 10.1.2.3:5432 while querying users"))
    assert.equal(d.message, "Something went wrong. Try again.")
    assert.equal(d.code, "internal")
    assert.match(d.detail, /ECONNREFUSED/, "the detail is kept for the log")
    assert.doesNotMatch(d.message, /ECONNREFUSED|10\.1\.2\.3/, "and never for the client")
  })

  it("handles a thrown non-Error without crashing", () => {
    assert.equal(describeStreamFailure("just a string").code, "internal")
    assert.equal(describeStreamFailure(undefined).message, "Something went wrong. Try again.")
  })
})

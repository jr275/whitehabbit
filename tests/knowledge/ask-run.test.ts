/* ================================================================== *
 * THE BROWSER'S VIEW OF A RUN — the reducer, and the whole path.
 *
 * Two kinds of test, deliberately:
 *
 * PURE — a malformed or hostile event sequence must not produce a
 * state the server never described: no phantom message, no step that
 * restarts, no spinner that never stops, no "failed" when the
 * connection merely dropped. These need no database and run in
 * milliseconds.
 *
 * END TO END — the real pipeline's events, encoded to NDJSON exactly
 * as the route encodes them, decoded a character at a time as a socket
 * would deliver them, then folded by the reducer. That is the whole
 * chain engine → wire → client state, with only the socket and the
 * provider faked. It is the test that would catch the contract and the
 * consumer drifting apart.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { runAskStream, type AskStreamTransport } from "@/lib/knowledge/ask-stream"
import {
  ASK_CUSTOM,
  ASK_STEPS,
  decodeAskEvent,
  EventType,
  splitLines,
  type AskEvent,
} from "@/lib/knowledge/agui"
import {
  finalizeAskRun,
  initialAskRunState,
  isAskRunLive,
  reduceAskEvent,
  reduceAskEvents,
} from "@/lib/knowledge/ask-run"

/* ================================================================== *
 * PURE
 * ================================================================== */

const started: AskEvent = { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1", timestamp: 10 }

describe("the Ask run reducer", () => {
  it("starts with all four steps pending, so the UI needs no 'which steps' branch", () => {
    const s = initialAskRunState()
    assert.equal(s.phase, "idle")
    assert.deepEqual(
      s.steps.map((x) => x.name),
      [...ASK_STEPS],
    )
    assert.ok(s.steps.every((x) => x.status === "pending"))
    assert.equal(s.text, "")
    assert.equal(s.truncated, false)
  })

  it("does not mutate the state it is given", () => {
    const before = initialAskRunState()
    const snapshot = JSON.stringify(before)
    reduceAskEvent(before, started)
    assert.equal(JSON.stringify(before), snapshot, "the reducer must be pure")
  })

  it("ignores a second RUN_STARTED instead of blanking a run in progress", () => {
    const s1 = reduceAskEvents([started, { type: EventType.STEP_STARTED, stepName: "retrieval", timestamp: 11 }])
    const s2 = reduceAskEvent(s1, { type: EventType.RUN_STARTED, threadId: "OTHER", runId: "OTHER" })
    assert.equal(s2.threadId, "t1", "the original run identity must survive")
    assert.equal(s2.steps[0].status, "running", "and its progress must not be reset")
  })

  it("ignores a duplicate STEP_STARTED rather than restarting its clock", () => {
    const s = reduceAskEvents([
      started,
      { type: EventType.STEP_STARTED, stepName: "retrieval", timestamp: 11 },
      { type: EventType.STEP_STARTED, stepName: "retrieval", timestamp: 99 },
    ])
    assert.equal(s.steps[0].startedAt, 11)
  })

  it("ignores a STEP_FINISHED for a step that never started", () => {
    const s = reduceAskEvents([started, { type: EventType.STEP_FINISHED, stepName: "generation", timestamp: 12 }])
    const gen = s.steps.find((x) => x.name === "generation")
    assert.equal(gen?.status, "pending", "a step cannot finish without having run")
  })

  it("ignores an unknown step name", () => {
    const s = reduceAskEvents([started, { type: EventType.STEP_STARTED, stepName: "telepathy" }])
    assert.ok(s.steps.every((x) => x.status === "pending"))
    assert.equal(s.steps.length, 4, "no step may be invented by an event")
  })

  it("refuses to materialise text from a message that never started", () => {
    const s = reduceAskEvents([
      started,
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "ghost", delta: "I was never announced." },
    ])
    assert.equal(s.text, "", "a phantom message is the exact failure this prevents")
    assert.equal(s.messageId, undefined)
  })

  it("ignores deltas for a different message id", () => {
    const s = reduceAskEvents([
      started,
      { type: EventType.TEXT_MESSAGE_START, messageId: "m1" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "real " },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m2", delta: "interloper" },
    ])
    assert.equal(s.text, "real ")
  })

  it("ignores a second TEXT_MESSAGE_START rather than discarding shown text", () => {
    const s = reduceAskEvents([
      started,
      { type: EventType.TEXT_MESSAGE_START, messageId: "m1" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "kept" },
      { type: EventType.TEXT_MESSAGE_START, messageId: "m2" },
    ])
    assert.equal(s.text, "kept")
    assert.equal(s.messageId, "m1")
  })

  it("ignores a delta after the message ended", () => {
    const s = reduceAskEvents([
      started,
      { type: EventType.TEXT_MESSAGE_START, messageId: "m1" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "done." },
      { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: " and more" },
    ])
    assert.equal(s.text, "done.")
    assert.equal(s.textClosed, true)
  })

  it("accumulates several deltas in order, for when the provider can stream", () => {
    const s = reduceAskEvents([
      started,
      { type: EventType.TEXT_MESSAGE_START, messageId: "m" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "one " },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "two " },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "three" },
    ])
    assert.equal(s.text, "one two three")
  })

  it("marks the step that was open as the step that failed", () => {
    const s = reduceAskEvents([
      started,
      { type: EventType.STEP_STARTED, stepName: "retrieval", timestamp: 11 },
      { type: EventType.STEP_FINISHED, stepName: "retrieval", timestamp: 12 },
      { type: EventType.STEP_STARTED, stepName: "evidence", timestamp: 13 },
      { type: EventType.RUN_ERROR, message: "Something went wrong. Try again.", code: "internal" },
    ])
    assert.equal(s.phase, "error")
    assert.equal(s.error?.code, "internal")
    assert.equal(s.steps.find((x) => x.name === "retrieval")?.status, "done")
    assert.equal(s.steps.find((x) => x.name === "evidence")?.status, "failed", "no spinner may outlive the run")
    assert.equal(s.steps.find((x) => x.name === "generation")?.status, "pending", "a step that never ran stays pending")
  })

  it("ignores a terminal event after the run already ended", () => {
    const base = reduceAskEvents([started, { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" }])
    const after = reduceAskEvent(base, { type: EventType.RUN_ERROR, message: "too late" })
    assert.equal(after.phase, "finished", "a finished run cannot be retroactively failed")
    assert.equal(after.error, undefined)
  })

  it("ignores a CUSTOM name it has no contract for", () => {
    const s = reduceAskEvent(reduceAskEvent(initialAskRunState(), started), {
      type: EventType.CUSTOM,
      name: "someone.elses.event",
      value: { nonsense: true },
    })
    assert.equal(s.retrieval, undefined)
    assert.equal(s.evidence, undefined)
    assert.equal(s.phase, "running")
  })

  /* ---- truncation is not failure ---------------------------------- */

  it("records a cut-off stream as truncated, not as an error the server reported", () => {
    const live = reduceAskEvents([
      started,
      { type: EventType.STEP_STARTED, stepName: "retrieval", timestamp: 11 },
      { type: EventType.STEP_FINISHED, stepName: "retrieval", timestamp: 12 },
      { type: EventType.STEP_STARTED, stepName: "generation", timestamp: 13 },
    ])
    const ended = finalizeAskRun(live)

    assert.equal(ended.truncated, true)
    assert.equal(ended.error, undefined, "the server never said it failed, so we must not either")
    assert.equal(ended.steps.find((x) => x.name === "generation")?.status, "failed")
  })

  it("leaves an already-terminal run alone when the stream ends", () => {
    const done = reduceAskEvents([started, { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" }])
    const ended = finalizeAskRun(done)
    assert.equal(ended.truncated, false)
    assert.equal(ended, done, "no needless new object for an already-settled run")
  })

  it("distinguishes a live run from a settled one", () => {
    assert.equal(isAskRunLive(initialAskRunState()), false, "idle is not live")
    assert.equal(isAskRunLive(reduceAskEvent(initialAskRunState(), started)), true)
    assert.equal(
      isAskRunLive(reduceAskEvents([started, { type: EventType.RUN_FINISHED, threadId: "t", runId: "r" }])),
      false,
      "a restored or completed answer must never render as in-flight",
    )
  })
})

/* ================================================================== *
 * A MALFORMED STREAM.
 *
 * The reducer is fed by JSON.parse over a socket, so its AskEvent
 * types describe what SHOULD arrive. Every case below was REPRODUCED
 * against the reducer before it checked these fields at runtime:
 * a delta-less TEXT_MESSAGE_CONTENT appended the literal string
 * "undefined" to the answer, a numeric delta appended "42", and a
 * message-less RUN_ERROR produced error: {} which the UI rendered as
 * an empty block.
 *
 * Each event goes through decodeAskEvent first, because the point is
 * that the WIRE admits these shapes — the decoder checks the event
 * type, not the payload.
 * ================================================================== */

describe("a malformed stream cannot invent content", () => {
  const decode = (json: string): AskEvent => {
    const e = decodeAskEvent(json)
    assert.ok(e, `the wire really does admit this: ${json}`)
    return e
  }

  const opened = () => [
    decode('{"type":"RUN_STARTED","threadId":"t","runId":"r"}'),
    decode('{"type":"TEXT_MESSAGE_START","messageId":"m"}'),
  ]

  it("drops a delta that is missing, instead of appending \"undefined\"", () => {
    const s = reduceAskEvents([...opened(), decode('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m"}')])
    assert.equal(s.text, "", "the answer must not contain text the server never sent")
    assert.doesNotMatch(s.text, /undefined/)
  })

  it("drops a delta that is not a string", () => {
    for (const bad of ['42', 'null', 'true', '{"a":1}', '["x"]']) {
      const s = reduceAskEvents([
        ...opened(),
        decode(`{"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":${bad}}`),
      ])
      assert.equal(s.text, "", `delta ${bad} must be dropped`)
    }
  })

  it("keeps a legitimate delta that happens to be empty", () => {
    const s = reduceAskEvents([...opened(), decode('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":""}')])
    assert.equal(s.text, "", "an empty string is a real delta, not a malformed one")
    assert.equal(s.messageId, "m")
  })

  it("refuses to open a message with no usable id", () => {
    for (const bad of ['{"type":"TEXT_MESSAGE_START"}', '{"type":"TEXT_MESSAGE_START","messageId":""}']) {
      const s = reduceAskEvents([decode('{"type":"RUN_STARTED","threadId":"t","runId":"r"}'), decode(bad)])
      assert.equal(s.messageId, undefined, `must not open a message: ${bad}`)
    }
  })

  it("still terminates on a message-less RUN_ERROR, with a real sentence", () => {
    // Dropping the terminal event would leave a spinner forever, so it
    // must land — but not as an empty error block.
    for (const bad of ['{"type":"RUN_ERROR"}', '{"type":"RUN_ERROR","message":"   "}', '{"type":"RUN_ERROR","message":5}']) {
      const s = reduceAskEvents([decode('{"type":"RUN_STARTED","threadId":"t","runId":"r"}'), decode(bad)])
      assert.equal(s.phase, "error", `must still terminate: ${bad}`)
      assert.equal(typeof s.error?.message, "string")
      assert.ok((s.error?.message ?? "").trim().length > 0, `must carry a real sentence: ${bad}`)
    }
  })

  it("keeps the server's own error message when it sent one", () => {
    const s = reduceAskEvents([
      decode('{"type":"RUN_STARTED","threadId":"t","runId":"r"}'),
      decode('{"type":"RUN_ERROR","message":"That page couldn\'t be loaded.","code":"upstream"}'),
    ])
    assert.equal(s.error?.message, "That page couldn't be loaded.", "a real message must never be replaced")
    assert.equal(s.error?.code, "upstream")
  })

  it("ignores a non-string error code rather than carrying it", () => {
    const s = reduceAskEvents([
      decode('{"type":"RUN_STARTED","threadId":"t","runId":"r"}'),
      decode('{"type":"RUN_ERROR","message":"nope","code":99}'),
    ])
    assert.equal(s.error?.code, undefined)
  })
})

/* ================================================================== *
 * END TO END: engine → NDJSON → socket → reducer
 * ================================================================== */

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
  const impl = (async () => {
    const status = opts.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        content: [{ type: "text", text }],
        model: "fake-model-1",
        usage: { input_tokens: 900, output_tokens: 40 },
      }),
      text: async () => "upstream detail",
    } as Response
  }) as unknown as typeof fetch
  return { impl }
}

/** Collects the wire, then replays it one character at a time — the
 *  worst case a socket offers — through splitLines + decodeAskEvent,
 *  exactly as a browser reader would. */
function wireTransport() {
  let buffer = ""
  const t = {
    closes: 0,
    send: (line: string) => void (buffer += line),
    close: () => void (t.closes += 1),
    replay(): AskEvent[] {
      const out: AskEvent[] = []
      let pending = ""
      for (const ch of buffer) {
        pending += ch
        const { lines, rest } = splitLines(pending)
        pending = rest
        for (const l of lines) {
          const e = decodeAskEvent(l)
          if (e) out.push(e)
        }
      }
      assert.equal(pending, "", "a complete stream leaves no partial line")
      return out
    },
  }
  return t as typeof t & AskStreamTransport
}

let savedKey: string | undefined

describe("engine to client, over the real wire format", () => {
  let alice: TestTenant
  let carol: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("run")
    carol = await createTenant("runc")
    const p = getTestPool()
    const id = `kn_${randomUUID()}`
    const now = Date.now()
    await p.query(
      `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,'Example','example.test',$6,$7,$7)`,
      [
        id,
        alice.orgId,
        alice.userId,
        `https://example.test/${id}`,
        "On chunking",
        "Most retrieval failures are chunking failures rather than model failures, and the distinction matters.",
        now,
      ],
    )
    await indexItem({ itemId: id, orgId: alice.orgId, userId: alice.userId })
    await embedItemChunks({ itemId: id, orgId: alice.orgId, userId: alice.userId }, { embeddings: fakeEmbeddings })
  })
  after(closeTestPool)

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = "sk-test"
  })
  const restore = () => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
  }

  it("reconstructs a finished run whose text and record agree", async () => {
    const tr = wireTransport()
    const model = fakeModel("Chunking is usually the culprit [1].")
    await runAskStream({
      ids: { threadId: "t", runId: "r" },
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const state = finalizeAskRun(reduceAskEvents(tr.replay()))

    assert.equal(state.phase, "finished")
    assert.equal(state.truncated, false)
    assert.ok(state.steps.every((s) => s.status === "done"), "all four steps complete on a successful run")
    assert.equal(state.text, "Chunking is usually the culprit [1].")
    assert.equal(state.answer?.answer, state.text, "the streamed text and the stored record must agree")
    assert.ok(state.citations && state.citations.citations.length > 0)
    assert.equal(state.usage?.inputTokens, 900)
    assert.equal(isAskRunLive(state), false)
  })

  it("reconstructs a refusal as finished, with generation never started", async () => {
    const tr = wireTransport()
    const model = fakeModel("should not be asked")
    await runAskStream({
      ids: { threadId: "t", runId: "r" },
      input: { question: "what is the airspeed velocity of an unladen swallow", scope: carol },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const state = finalizeAskRun(reduceAskEvents(tr.replay()))

    assert.equal(state.phase, "finished", "a refusal is an answer, not a failure")
    assert.equal(state.refusal?.answer !== undefined, true)
    assert.equal(state.steps.find((s) => s.name === "retrieval")?.status, "done")
    assert.equal(state.steps.find((s) => s.name === "evidence")?.status, "done")
    assert.equal(
      state.steps.find((s) => s.name === "generation")?.status,
      "pending",
      "no model was asked, so that step must read as never run",
    )
    assert.equal(state.text, "", "no text was generated, so none may be shown")
    assert.equal(state.usage, undefined)
    assert.equal(state.evidence?.refused, true)
  })

  it("reconstructs a provider failure as an error on the generation step", async () => {
    const tr = wireTransport()
    const model = fakeModel("never returned", { status: 500 })
    await runAskStream({
      ids: { threadId: "t", runId: "r" },
      input: { question: "why do chunking projects fail?", scope: alice },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const state = finalizeAskRun(reduceAskEvents(tr.replay()))

    assert.equal(state.phase, "error")
    assert.equal(state.truncated, false, "the server reported the failure, so this is not truncation")
    assert.equal(state.steps.find((s) => s.name === "generation")?.status, "failed")
    assert.equal(state.steps.find((s) => s.name === "verification")?.status, "pending")
    assert.ok(state.error?.message)
    assert.doesNotMatch(state.error?.message ?? "", /upstream detail|sk-test/, "no internals in a user-facing error")
    assert.equal(state.answer, undefined)
  })

  it("carries the evidence counts a user needs to understand a refusal", async () => {
    const tr = wireTransport()
    const model = fakeModel("unused")
    await runAskStream({
      ids: { threadId: "t", runId: "r" },
      input: { question: "what is the airspeed velocity of an unladen swallow", scope: carol },
      transport: tr,
      deps: { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    })
    restore()

    const state = reduceAskEvents(tr.replay())
    assert.ok(state.retrieval, "retrieval must report what it did")
    assert.equal(state.evidence?.chunksUsed, 0)
    assert.equal(typeof state.evidence?.chunksRejected, "number")
    assert.ok(customPresent(tr.replay(), ASK_CUSTOM.refusal))
  })
})

function customPresent(events: AskEvent[], name: string): boolean {
  return events.some((e) => e.type === EventType.CUSTOM && (e as { name?: unknown }).name === name)
}

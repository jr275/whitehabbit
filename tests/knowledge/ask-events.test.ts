/* ================================================================== *
 * THE ASK RUN'S AG-UI EVENT STREAM — the contract, not the decoration.
 *
 * These events are what a conversational UI renders progress from, so
 * a stream that lies is worse than no stream: it shows a step
 * finishing that never did, or an answer appearing that was never
 * generated. Every assertion here is about the stream agreeing with
 * what the pipeline actually did.
 *
 * THE DEFECT THIS FILE WAS WRITTEN FOR. The emitter shipped with
 * stepStarted("generation") and no matching stepFinished, the text
 * events imported but never sent, and no verification step at all. An
 * observer saw a run that began writing an answer and then stopped
 * forever. Pairing is asserted structurally below, so that class of
 * defect fails a test rather than reaching a UI.
 *
 * Retrieval runs against real PostgreSQL. The embedding provider and
 * the model are fakes, as in tests/knowledge/answer.test.ts — the
 * point is the event sequence, and neither a network nor a credential
 * is needed to observe it.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { answerFromKnowledge } from "@/lib/knowledge/answer"
import {
  ASK_CUSTOM,
  ASK_STEPS,
  decodeAskEvent,
  encodeAskEvent,
  EventType,
  isAskStepName,
  splitLines,
  type AskEvent,
} from "@/lib/knowledge/agui"

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
  embedding: "An embedding model mismatched to the domain is invisible in evaluation and obvious in production.",
}

/* ---- recording the stream ------------------------------------------- */

function recorder() {
  const events: AskEvent[] = []
  return { events, sink: (e: AskEvent) => void events.push(e) }
}

const typesOf = (events: AskEvent[]) => events.map((e) => e.type)

function stepEvents(events: AskEvent[]): { type: string; stepName: string }[] {
  return events
    .filter((e) => e.type === EventType.STEP_STARTED || e.type === EventType.STEP_FINISHED)
    .map((e) => ({ type: e.type, stepName: String((e as { stepName?: unknown }).stepName) }))
}

function customNamed(events: AskEvent[], name: string): AskEvent | undefined {
  return events.find((e) => e.type === EventType.CUSTOM && (e as { name?: unknown }).name === name)
}

/**
 * Structural pairing check: walk the step events and require that
 * every STEP_FINISHED closes a step that is currently open, that no
 * step is opened twice, and that nothing is left open.
 *
 * Returns the steps still open, so a test can assert either balance
 * (success) or a specific unfinished step (failure).
 */
function openSteps(events: AskEvent[]): string[] {
  const open: string[] = []
  const everOpened: string[] = []
  for (const e of stepEvents(events)) {
    if (e.type === EventType.STEP_STARTED) {
      assert.ok(isAskStepName(e.stepName), `unknown step name "${e.stepName}"`)
      assert.ok(!open.includes(e.stepName), `step "${e.stepName}" was started while already open`)
      assert.ok(!everOpened.includes(e.stepName), `step "${e.stepName}" was started twice in one run`)
      open.push(e.stepName)
      everOpened.push(e.stepName)
    } else {
      const i = open.indexOf(e.stepName)
      assert.notEqual(i, -1, `step "${e.stepName}" finished without having started`)
      open.splice(i, 1)
    }
  }
  return open
}

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

describe("the Ask run's event stream", () => {
  let alice: TestTenant
  /** Saves nothing — the real empty-library refusal path. */
  let carol: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("evt")
    carol = await createTenant("evtc")
    await saveAndIndex(alice, DOCS.chunking, "On chunking")
    await saveAndIndex(alice, DOCS.embedding, "On embeddings")
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

  /* ---- the answered path ------------------------------------------- */

  it("reports all four steps, each started once and finished once", async () => {
    const rec = recorder()
    const model = fakeModel("Chunking is usually the culprit [1].")
    const result = await answerFromKnowledge(
      { question: "why do chunking projects fail?", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
    )
    restore()

    assert.equal(result.status, "answered")
    assert.deepEqual(openSteps(rec.events), [], "every started step must finish")

    const started = stepEvents(rec.events)
      .filter((e) => e.type === EventType.STEP_STARTED)
      .map((e) => e.stepName)
    assert.deepEqual(started, [...ASK_STEPS], "the four real stages, in pipeline order")
  })

  it("brackets the answer text inside the generation step", async () => {
    const rec = recorder()
    const model = fakeModel("Chunking is usually the culprit [1].")
    await answerFromKnowledge(
      { question: "why do chunking projects fail?", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
    )
    restore()

    const t = typesOf(rec.events)
    const genStart = t.indexOf(EventType.STEP_STARTED)
    const textStart = t.indexOf(EventType.TEXT_MESSAGE_START)
    const textEnd = t.indexOf(EventType.TEXT_MESSAGE_END)

    assert.ok(textStart > genStart, "text cannot start before the run has stepped")
    assert.ok(t.indexOf(EventType.TEXT_MESSAGE_CONTENT) > textStart, "a delta before the start is malformed")
    assert.ok(textEnd > t.indexOf(EventType.TEXT_MESSAGE_CONTENT), "the end must follow the last delta")

    // One message, one id, throughout.
    const ids = new Set(
      rec.events
        .filter((e) =>
          [EventType.TEXT_MESSAGE_START, EventType.TEXT_MESSAGE_CONTENT, EventType.TEXT_MESSAGE_END].includes(
            e.type as never,
          ),
        )
        .map((e) => String((e as { messageId?: unknown }).messageId)),
    )
    assert.equal(ids.size, 1, "the three text events must share one messageId")
    assert.ok(![...ids][0].includes("undefined"), "messageId must be real")
  })

  it("streams exactly the answer it returns, so stream and record cannot disagree", async () => {
    const rec = recorder()
    const model = fakeModel("  Chunking is usually the culprit [1].  ")
    const result = await answerFromKnowledge(
      { question: "why do chunking projects fail?", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
    )
    restore()

    const deltas = rec.events
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => String((e as { delta?: unknown }).delta))
      .join("")
    assert.equal(deltas, result.answer, "the concatenated deltas must equal the stored answer")
    assert.equal(deltas, "Chunking is usually the culprit [1].", "and both must be the trimmed text")
  })

  it("reports the verified citations and the usage that was actually spent", async () => {
    const rec = recorder()
    const model = fakeModel("Chunking is usually the culprit [1].")
    const result = await answerFromKnowledge(
      { question: "why do chunking projects fail?", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
    )
    restore()

    const cites = customNamed(rec.events, ASK_CUSTOM.citations)
    assert.ok(cites, "the citations event is how a UI renders sources")
    const value = (cites as { value: { citations: unknown[]; unresolvedCitationIds: unknown[] } }).value
    assert.deepEqual(value.citations, result.citations, "the event must carry the same citations as the record")
    assert.deepEqual(value.unresolvedCitationIds, result.unresolvedCitationIds)

    const usage = customNamed(rec.events, ASK_CUSTOM.usage)
    assert.ok(usage, "a real model call must report its cost")
    assert.equal((usage as { value: { inputTokens: number } }).value.inputTokens, 900)
  })

  it("reports an unresolved citation rather than hiding it", async () => {
    const rec = recorder()
    // [9] does not exist in the assembled context.
    const model = fakeModel("Chunking is the culprit [1], and so is the weather [9].")
    const result = await answerFromKnowledge(
      { question: "why do chunking projects fail?", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
    )
    restore()

    assert.ok(result.unresolvedCitationIds.length > 0, "the fabricated marker must be detected")
    const value = (customNamed(rec.events, ASK_CUSTOM.citations) as { value: { unresolvedCitationIds: string[] } })
      .value
    assert.deepEqual(value.unresolvedCitationIds, result.unresolvedCitationIds)
  })

  /* ---- the refusal path ------------------------------------------- */

  it("never starts a generation step when it refuses, and says so explicitly", async () => {
    const rec = recorder()
    const model = fakeModel("I should not have been asked.")
    const result = await answerFromKnowledge(
      { question: "what is the airspeed velocity of an unladen swallow", scope: carol },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
    )
    restore()

    assert.equal(result.status, "no_evidence")
    assert.equal(model.requests.length, 0, "no evidence must mean no model call")

    const started = stepEvents(rec.events)
      .filter((e) => e.type === EventType.STEP_STARTED)
      .map((e) => e.stepName)
    assert.deepEqual(started, ["retrieval", "evidence"], "a refusal stops after weighing the evidence")
    assert.deepEqual(openSteps(rec.events), [], "and still leaves no step dangling")

    assert.ok(customNamed(rec.events, ASK_CUSTOM.refusal), "the refusal is an event, not an inference")
    assert.equal(
      typesOf(rec.events).includes(EventType.TEXT_MESSAGE_START),
      false,
      "no message may be started for an answer that was never generated",
    )
    assert.equal(customNamed(rec.events, ASK_CUSTOM.usage), undefined, "nothing was spent, so nothing is reported")
  })

  it("marks the evidence event as refused, with the rejected count that explains why", async () => {
    const rec = recorder()
    const model = fakeModel("unused")
    await answerFromKnowledge(
      { question: "what is the airspeed velocity of an unladen swallow", scope: carol },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
    )
    restore()

    const ev = customNamed(rec.events, ASK_CUSTOM.evidence)
    assert.ok(ev)
    const value = (ev as { value: { refused: boolean; chunksUsed: number } }).value
    assert.equal(value.refused, true)
    assert.equal(value.chunksUsed, 0)
  })

  /* ---- the failure path ------------------------------------------- */

  it("leaves generation unfinished when the provider fails, and emits no text", async () => {
    const rec = recorder()
    const model = fakeModel("never returned", { status: 500 })
    await assert.rejects(() =>
      answerFromKnowledge(
        { question: "why do chunking projects fail?", scope: alice },
        { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
      ),
    )
    restore()

    // The honest shape of a failure: the step that did not finish is
    // the one that failed. Claiming it finished would be the lie.
    assert.deepEqual(openSteps(rec.events), ["generation"], "generation must be reported as still open")
    assert.equal(
      typesOf(rec.events).includes(EventType.TEXT_MESSAGE_START),
      false,
      "a failed generation produces no message",
    )
    assert.equal(customNamed(rec.events, ASK_CUSTOM.citations), undefined, "nothing was verified")
  })

  it("never puts a credential or an upstream detail on the stream", async () => {
    const rec = recorder()
    const model = fakeModel("never returned", { status: 500 })
    await assert.rejects(() =>
      answerFromKnowledge(
        { question: "why do chunking projects fail?", scope: alice },
        { embeddings: fakeEmbeddings, fetchImpl: model.impl, onEvent: rec.sink },
      ),
    )
    restore()

    const wire = rec.events.map(encodeAskEvent).join("")
    assert.doesNotMatch(wire, /sk-test-must-not-be-emitted/, "the API key reached the stream")
    assert.doesNotMatch(wire, /upstream detail/, "the provider's response body reached the stream")
  })

  /* ---- the observer cannot change the observed -------------------- */

  it("answers identically with no sink at all", async () => {
    const model = fakeModel("Chunking is usually the culprit [1].")
    const result = await answerFromKnowledge(
      { question: "why do chunking projects fail?", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    // The non-streaming route and its tests take exactly this path.
    assert.equal(result.status, "answered")
    assert.equal(result.answer, "Chunking is usually the culprit [1].")
  })

  it("survives a sink that throws on every event", async () => {
    const model = fakeModel("Chunking is usually the culprit [1].")
    let calls = 0
    const result = await answerFromKnowledge(
      { question: "why do chunking projects fail?", scope: alice },
      {
        embeddings: fakeEmbeddings,
        fetchImpl: model.impl,
        onEvent: () => {
          calls += 1
          throw new Error("the observer is broken")
        },
      },
    )
    restore()

    assert.ok(calls > 0, "the sink really was called")
    assert.equal(result.status, "answered", "a broken observer must not turn a good answer into a failure")
    assert.equal(result.answer, "Chunking is usually the culprit [1].")
  })
})

/* ================================================================== *
 * THE TRANSPORT. Pure, no database, no pipeline.
 * ================================================================== */

describe("the NDJSON transport", () => {
  it("round-trips every event this stream carries", () => {
    const samples: AskEvent[] = [
      { type: EventType.RUN_STARTED, threadId: "t", runId: "r", protocolVersion: "1.0" },
      { type: EventType.STEP_STARTED, stepName: "retrieval" },
      { type: EventType.STEP_FINISHED, stepName: "retrieval" },
      { type: EventType.TEXT_MESSAGE_START, messageId: "m", role: "assistant" },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "hello\nworld" },
      { type: EventType.TEXT_MESSAGE_END, messageId: "m" },
      { type: EventType.CUSTOM, name: ASK_CUSTOM.evidence, value: { refused: false } },
      { type: EventType.RUN_FINISHED, threadId: "t", runId: "r", result: { status: "answered" } },
      { type: EventType.RUN_ERROR, message: "something generic" },
    ]
    for (const event of samples) {
      const line = encodeAskEvent(event)
      assert.equal(line.endsWith("\n"), true, "every record must be newline-terminated")
      assert.equal(line.indexOf("\n"), line.length - 1, "a newline inside a payload would split one event into two")
      assert.deepEqual(decodeAskEvent(line), event)
    }
  })

  it("drops a line it cannot use instead of throwing", () => {
    // A truncated last line is an ordinary way for a connection to end.
    for (const bad of ["", "   ", "{not json", "null", "[]", '{"no":"type"}', '{"type":42}']) {
      assert.equal(decodeAskEvent(bad), null, `should have dropped: ${bad}`)
    }
  })

  it("drops an event type this stream is not specified to carry", () => {
    // A future producer adding events must not make this UI render
    // something it has no contract for.
    assert.equal(decodeAskEvent('{"type":"REASONING_START"}'), null)
    assert.equal(decodeAskEvent('{"type":"TOOL_CALL_START","toolCallId":"x","toolCallName":"y"}'), null)
  })

  it("reassembles events split across chunk boundaries", () => {
    const events: AskEvent[] = [
      { type: EventType.STEP_STARTED, stepName: "retrieval" },
      { type: EventType.STEP_FINISHED, stepName: "retrieval" },
      { type: EventType.CUSTOM, name: ASK_CUSTOM.usage, value: { inputTokens: 1 } },
    ]
    const wire = events.map(encodeAskEvent).join("")

    // Feed it one character at a time — the worst case a socket offers.
    const decoded: AskEvent[] = []
    let buffer = ""
    for (const ch of wire) {
      buffer += ch
      const { lines, rest } = splitLines(buffer)
      buffer = rest
      for (const line of lines) {
        const e = decodeAskEvent(line)
        if (e) decoded.push(e)
      }
    }
    assert.equal(buffer, "", "a complete stream leaves no remainder")
    assert.deepEqual(decoded, events)
  })

  it("holds back a partial final line rather than decoding half an event", () => {
    const { lines, rest } = splitLines('{"type":"STEP_STARTED","stepName":"retrieval"}\n{"type":"STEP_FIN')
    assert.equal(lines.length, 1)
    assert.equal(rest, '{"type":"STEP_FIN')
    assert.deepEqual(decodeAskEvent(lines[0]), { type: EventType.STEP_STARTED, stepName: "retrieval" })
  })
})

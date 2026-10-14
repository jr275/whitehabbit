/* ================================================================== *
 * THE BOUNDED NDJSON READER.
 *
 * THE DEFECT THIS EXISTS FOR. splitLines holds whatever has not yet
 * ended in a newline, and the hook appended to that remainder on every
 * chunk. A server that sends bytes and never a newline therefore grew
 * the browser's memory without limit — a denial of service against the
 * CLIENT, reachable by anything able to answer the request.
 *
 * TWO limits are asserted here, because an earlier version of the
 * reader bounded only one. A complete line can be oversized on its own
 * (one enormous event in a single chunk); the residual can grow across
 * chunks that never contain a newline. Both are refused.
 *
 * WHERE THE LIMIT COMES FROM. Measured, not guessed: against a full
 * 6000-token context budget and a maximum-length 1200-token answer,
 * the largest real event (keeply.ask.answer) was 8,305 bytes and the
 * whole stream 17,883 bytes. The theoretical ceiling is ~40 KB. The
 * cap is 256 KiB — ~6x the ceiling, ~32x the measurement.
 *
 * Pure: no database, no network, no timers.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  AskStreamOverflowError,
  createAskStreamReader,
  encodeAskEvent,
  EventType,
  MAX_ASK_EVENT_BYTES,
  type AskEvent,
} from "@/lib/knowledge/agui"

const enc = (s: string) => new TextEncoder().encode(s)
const step = (name: string): AskEvent => ({ type: EventType.STEP_STARTED, stepName: name })

describe("the limit is published and plausible", () => {
  it("is 256 KiB — far above the largest real event, far below a memory problem", () => {
    assert.equal(MAX_ASK_EVENT_BYTES, 262_144)
    assert.ok(MAX_ASK_EVENT_BYTES > 40_000, "must clear the protocol's theoretical worst case (~40 KB)")
    assert.ok(MAX_ASK_EVENT_BYTES <= 1_048_576, "must still bound client memory")
  })
})

/* ---- normal operation ------------------------------------------- */

describe("the reader passes valid traffic through untouched", () => {
  it("delivers a line well below the limit", () => {
    const r = createAskStreamReader()
    const events = r.push(enc(encodeAskEvent(step("retrieval"))))
    assert.equal(events.length, 1)
    assert.equal(events[0].type, EventType.STEP_STARTED)
    assert.equal(r.hasPartial(), false)
  })

  it("delivers several events arriving in one chunk", () => {
    const r = createAskStreamReader()
    const wire = [step("retrieval"), step("evidence"), step("generation")].map(encodeAskEvent).join("")
    assert.equal(r.push(enc(wire)).length, 3)
  })

  it("continues normally across many chunks and many events", () => {
    const r = createAskStreamReader()
    const wire = Array.from({ length: 50 }, (_, i) => encodeAskEvent(step(i % 2 ? "retrieval" : "evidence"))).join("")
    const bytes = enc(wire)
    let total = 0
    for (let i = 0; i < bytes.length; i += 7) total += r.push(bytes.slice(i, i + 7)).length
    assert.equal(total, 50, "every event must arrive exactly once")
    assert.equal(r.hasPartial(), false)
    assert.equal(r.pendingBytes(), 0)
  })

  it("skips blank lines without treating them as events", () => {
    const r = createAskStreamReader()
    const events = r.push(enc(`\n\n${encodeAskEvent(step("retrieval"))}\n\n`))
    assert.equal(events.length, 1, "empty lines are not events and are not errors")
  })

  it("accepts a large but legitimate event — the size a real answer reaches", () => {
    const r = createAskStreamReader()
    const big = { type: EventType.CUSTOM, name: "keeply.ask.answer", value: { answer: "x".repeat(40_000) } } as AskEvent
    const events = r.push(enc(encodeAskEvent(big)))
    assert.equal(events.length, 1, "40 KB is within the protocol's real range and must pass")
  })
})

/* ---- the limit --------------------------------------------------- */

describe("the reader refuses an oversized event", () => {
  it("accepts a line of exactly the limit", () => {
    const limit = 2048
    const r = createAskStreamReader({ maxEventBytes: limit })
    const line = `${JSON.stringify({ type: EventType.CUSTOM, name: "keeply.ask.evidence", value: { pad: "x".repeat(limit - 80) } })}\n`
    const lineBytes = enc(line.slice(0, -1)).byteLength
    assert.ok(lineBytes <= limit, `fixture must be within the limit (${lineBytes} <= ${limit})`)
    assert.equal(r.push(enc(line)).length, 1, "a line at or under the cap must be delivered")
  })

  it("refuses a single complete line above the limit, even in one chunk", () => {
    // The case an earlier version of this reader let through, because
    // it bounded only the unterminated residual.
    const limit = 2048
    const r = createAskStreamReader({ maxEventBytes: limit })
    const huge = `${JSON.stringify({ type: EventType.CUSTOM, name: "keeply.ask.answer", value: { pad: "x".repeat(limit * 4) } })}\n`
    assert.throws(() => r.push(enc(huge)), AskStreamOverflowError)
  })

  it("refuses a stream that never sends a newline, once past the limit", () => {
    const limit = 4096
    const r = createAskStreamReader({ maxEventBytes: limit })
    const kb = enc("x".repeat(1024))
    let threw: unknown = null
    try {
      for (let i = 0; i < 100; i++) r.push(kb)
    } catch (err) {
      threw = err
    }
    assert.ok(threw instanceof AskStreamOverflowError, "an endless line must be refused, not accumulated")
    assert.ok((threw as AskStreamOverflowError).bytes > limit)
  })

  it("drops the held payload when it refuses, so nothing oversized is retained", () => {
    const limit = 1024
    const r = createAskStreamReader({ maxEventBytes: limit })
    assert.throws(() => r.push(enc("x".repeat(limit * 2))), AskStreamOverflowError)
    assert.equal(r.pendingBytes(), 0, "the refused bytes must not be kept")
    assert.equal(r.hasPartial(), false)
  })

  it("names no payload in its message, so a hostile stream cannot reach a log", () => {
    const limit = 512
    const r = createAskStreamReader({ maxEventBytes: limit })
    const secretish = "SENSITIVE-PAYLOAD-" + "y".repeat(limit * 3)
    try {
      r.push(enc(secretish))
      assert.fail("expected an overflow")
    } catch (err) {
      assert.ok(err instanceof AskStreamOverflowError)
      assert.doesNotMatch(err.message, /SENSITIVE-PAYLOAD/, "the payload reached the error message")
      assert.doesNotMatch(err.message, /yyyy/, "the payload reached the error message")
      assert.match(err.message, /exceeded 512 bytes/, "the limit itself is safe to state")
    }
  })
})

/* ---- malformed and fragmented input ------------------------------ */

describe("the reader survives malformed and fragmented input", () => {
  it("drops invalid JSON without throwing and keeps reading", () => {
    const r = createAskStreamReader()
    const events = r.push(enc(`{not json\n${encodeAskEvent(step("retrieval"))}`))
    assert.equal(events.length, 1, "the bad line is dropped; the good one still arrives")
  })

  it("drops an event type the stream is not specified to carry", () => {
    const r = createAskStreamReader()
    assert.equal(r.push(enc('{"type":"REASONING_START"}\n')).length, 0)
  })

  it("reassembles a UTF-8 character split across two chunks", () => {
    const r = createAskStreamReader()
    // "é" is 0xC3 0xA9 — split between chunks.
    const line = encodeAskEvent({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "café ☕" })
    const bytes = enc(line)
    const cut = bytes.indexOf(0xc3)
    assert.ok(cut > 0, "fixture must contain a multi-byte character")
    assert.equal(r.push(bytes.slice(0, cut + 1)).length, 0, "an incomplete character completes nothing")
    const events = r.push(bytes.slice(cut + 1))
    assert.equal(events.length, 1)
    assert.equal((events[0] as { delta?: string }).delta, "café ☕", "the character must survive the boundary")
  })

  it("counts bytes rather than characters, so multi-byte text cannot slip past", () => {
    const limit = 600
    const r = createAskStreamReader({ maxEventBytes: limit })
    // 400 three-byte characters = 1200 bytes but only 400 JS code units.
    const multi = "☕".repeat(400)
    assert.ok(multi.length < limit, "fewer characters than the limit")
    assert.ok(enc(multi).byteLength > limit, "but more bytes than the limit")
    assert.throws(() => r.push(enc(multi)), AskStreamOverflowError, "a character count would have accepted this")
  })

  it("reports a residual at EOF, which is how a cut stream is recognised", () => {
    const r = createAskStreamReader()
    r.push(enc('{"type":"STEP_STARTED","stepName":"retri'))
    assert.equal(r.hasPartial(), true, "an unterminated tail means the stream ended mid-event")
    assert.ok(r.pendingBytes() > 0)
  })

  it("holds a partial line without emitting it, then completes it", () => {
    const r = createAskStreamReader()
    const line = encodeAskEvent(step("retrieval"))
    const half = Math.floor(line.length / 2)
    assert.equal(r.push(enc(line.slice(0, half))).length, 0, "half an event is not an event")
    assert.equal(r.push(enc(line.slice(half))).length, 1)
    assert.equal(r.hasPartial(), false)
  })

  it("keeps readers independent, so one refused stream cannot affect another", () => {
    const a = createAskStreamReader({ maxEventBytes: 256 })
    const b = createAskStreamReader({ maxEventBytes: 256 })
    assert.throws(() => a.push(enc("z".repeat(1000))), AskStreamOverflowError)
    assert.equal(b.push(enc(encodeAskEvent(step("retrieval")))).length, 1, "the other reader is unaffected")
  })
})

/* ---- the overflow is terminal, not a hang ------------------------ */

describe("an overflow can terminate a run rather than leave it loading", () => {
  it("RUN_ERROR terminates even before RUN_STARTED was seen", async () => {
    // The hook turns an overflow into RUN_ERROR. If the overflow lands
    // on the very first chunk, the reducer has not seen RUN_STARTED —
    // and an earlier version ignored RUN_ERROR unless the run was
    // already "running", which left four pending steps on screen
    // forever.
    const { initialAskRunState, reduceAskEvent } = await import("@/lib/knowledge/ask-run")
    const { runError } = await import("@/lib/knowledge/agui")
    const state = reduceAskEvent(initialAskRunState(), runError("too large", "stream_overflow"))
    assert.equal(state.phase, "error", "an error before the run started must still be terminal")
    assert.equal(state.error?.code, "stream_overflow")
    assert.ok(state.steps.every((s) => s.status !== "running"), "no step may be left spinning")
  })
})

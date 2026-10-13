/* ================================================================== *
 * THE ASK RUN, AS AG-UI EVENTS — the wire contract between the Ask
 * pipeline and the browser.
 *
 * NO "server-only" HERE, DELIBERATELY. Both ends compile against this
 * file: the route emits these events and the browser reduces them. A
 * contract that each side declares for itself is a contract that
 * drifts (AGENTS.md §1).
 *
 * ---- WHY AG-UI AND NOT A HOME-MADE EVENT SHAPE ---------------------
 *
 * AG-UI (https://github.com/ag-ui-protocol/ag-ui, protocol 1.0) is the
 * open event vocabulary for agent-to-UI communication. `@ag-ui/core`
 * carries ZERO dependencies — verified: `pnpm add` reported exactly
 * `+1` package — so adopting the standard costs a type package and
 * nothing else.
 *
 * It is also the vocabulary CopilotKit itself speaks: `@copilotkit/
 * runtime@1.78.0` depends on this same `@ag-ui/core@1.0.2`. So the
 * events below are not a detour away from CopilotKit; they are what
 * its runtime would emit. Adopting its runtime later becomes an
 * adapter over this contract rather than a rewrite of the pipeline.
 *
 * Why its runtime was NOT adopted now is recorded in
 * docs/keeply-agent-native.md with the dependency evidence.
 *
 * ---- WHAT THESE EVENTS DESCRIBE -------------------------------------
 *
 * The real stages inside answerFromKnowledge, in the order it runs
 * them. Nothing here is decorative: every step maps to code that
 * actually executes, and the one that does NOT execute on a refusal
 * (generation) is reported as not having run rather than as finished.
 *
 *   RUN_STARTED
 *     STEP retrieval    → searchKnowledge (hybrid + rerank)
 *       CUSTOM retrieval
 *     STEP evidence     → admissibility floor + context assembly
 *       CUSTOM evidence
 *     [refusal: CUSTOM refusal, then RUN_FINISHED — no model call]
 *     STEP generation   → callLlm
 *       TEXT_MESSAGE_START / _CONTENT / _END
 *     STEP verification → citation markers resolved against context
 *       CUSTOM citations
 *   RUN_FINISHED  (or RUN_ERROR)
 *
 * ---- ON TEXT DELTAS -------------------------------------------------
 *
 * TEXT_MESSAGE_CONTENT carries deltas, and the contract is written for
 * many of them. Today lib/ai/llm has no streaming path — callLlm
 * returns one complete string — so the emitter sends a single delta
 * holding the whole answer. That is the honest representation of what
 * the provider layer currently does. When callLlm gains streaming,
 * only the emitter changes; this contract and the browser reducer do
 * not. The UI must not simulate a typewriter over an answer that
 * arrived whole: inventing progress the backend never reported is the
 * exact failure lib/knowledge/use-knowledge-ai.ts exists to avoid.
 * ================================================================== */

import { EventType, PROTOCOL_VERSION } from "@ag-ui/core"
import type {
  BaseEvent,
  CustomEvent as AguiCustomEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StepFinishedEvent,
  StepStartedEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
} from "@ag-ui/core"

import type { AnswerStatus, AnsweredCitation, AnswerRetrievalReport, KnowledgeAnswer } from "./ai"

export { EventType, PROTOCOL_VERSION }

/* ------------------------------------------------------------------ *
 * STEPS. Named as data so the browser can label them without a
 * parallel list of strings to keep in sync.
 * ------------------------------------------------------------------ */

export const ASK_STEPS = ["retrieval", "evidence", "generation", "verification"] as const

export type AskStepName = (typeof ASK_STEPS)[number]

export function isAskStepName(value: unknown): value is AskStepName {
  return typeof value === "string" && (ASK_STEPS as readonly string[]).includes(value)
}

/** What each step is, in the user's terms. One definition, used by the
 *  timeline UI — not re-invented per component. */
export const ASK_STEP_LABELS: Record<AskStepName, string> = {
  retrieval: "Searching your library",
  evidence: "Weighing the evidence",
  generation: "Writing the answer",
  verification: "Checking every citation",
}

/* ------------------------------------------------------------------ *
 * CUSTOM EVENT NAMES. AG-UI's CUSTOM event is the protocol's escape
 * hatch for domain payloads. Namespaced so a future second producer
 * on the same stream cannot collide with these.
 * ------------------------------------------------------------------ */

export const ASK_CUSTOM = {
  /** What retrieval actually did — mode, candidates, whether semantic ran. */
  retrieval: "keeply.ask.retrieval",
  /** How many passages were admitted as evidence, and how many were not. */
  evidence: "keeply.ask.evidence",
  /** The refusal gate fired: evidence was insufficient, so NO model was called. */
  refusal: "keeply.ask.refusal",
  /** The citations, after every marker was resolved against real passages. */
  citations: "keeply.ask.citations",
  /** Provider, model and token counts for the call that was made. */
  usage: "keeply.ask.usage",
} as const

export type AskCustomName = (typeof ASK_CUSTOM)[keyof typeof ASK_CUSTOM]

/* ------------------------------------------------------------------ *
 * CUSTOM EVENT PAYLOADS. Each mirrors a value the pipeline already
 * computes — none is derived for display, so none can disagree with
 * the final answer.
 * ------------------------------------------------------------------ */

export interface AskRetrievalPayload {
  mode: AnswerRetrievalReport["mode"]
  executed: AnswerRetrievalReport["executed"]
  semanticSearch: AnswerRetrievalReport["semanticSearch"]
  candidates: number
  chunksRetrieved: number
}

export interface AskEvidencePayload {
  /** Passages that cleared the admissibility rule and became context. */
  chunksUsed: number
  /** Retrieved, then rejected as evidence. A high number against a
   *  refusal is the useful diagnostic: neighbours, but no sources. */
  chunksRejected: number
  droppedChunks: number
  contextTokens: number
  /** Did the refusal gate fire? When true, generation never ran. */
  refused: boolean
}

export interface AskRefusalPayload {
  /** The plain-sentence refusal, exactly as the pipeline produced it. */
  answer: string
  chunksRejected: number
}

export interface AskCitationsPayload {
  citations: AnsweredCitation[]
  /** Markers the model produced that resolved to nothing. Reported,
   *  never rendered as a link. */
  unresolvedCitationIds: string[]
}

export interface AskUsagePayload {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
}

/* ------------------------------------------------------------------ *
 * THE EVENT UNION on this stream. A closed union, so the reducer's
 * switch is exhaustive and a new event type cannot be forgotten.
 * ------------------------------------------------------------------ */

export type AskEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | AguiCustomEvent

/** Where the server sends events. Synchronous and returning void: an
 *  observer that can fail or stall must not be able to change the
 *  answer, so the pipeline never awaits it. */
export type AskEventSink = (event: AskEvent) => void

/* ------------------------------------------------------------------ *
 * CONSTRUCTORS. Every event carries a timestamp from one place, so
 * "when did this step end" is answerable from the stream alone.
 * ------------------------------------------------------------------ */

export interface AskRunIds {
  threadId: string
  runId: string
}

export function runStarted(ids: AskRunIds, now = Date.now()): RunStartedEvent {
  return {
    type: EventType.RUN_STARTED,
    threadId: ids.threadId,
    runId: ids.runId,
    protocolVersion: PROTOCOL_VERSION,
    timestamp: now,
  }
}

export function runFinished(ids: AskRunIds, status: AnswerStatus, now = Date.now()): RunFinishedEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId: ids.threadId,
    runId: ids.runId,
    // The pipeline's own status word, not a re-interpretation of it.
    result: { status },
    timestamp: now,
  }
}

/**
 * A failure, in the one shape the browser can show a stranger.
 *
 * `message` is user-facing and must already be safe — the pipeline's
 * upstream error text is deliberately generic for this reason. Nothing
 * here carries a provider message, a URL or a stack.
 */
export function runError(message: string, code?: string, now = Date.now()): RunErrorEvent {
  return { type: EventType.RUN_ERROR, message, code, timestamp: now }
}

export function stepStarted(stepName: AskStepName, now = Date.now()): StepStartedEvent {
  return { type: EventType.STEP_STARTED, stepName, timestamp: now }
}

export function stepFinished(stepName: AskStepName, now = Date.now()): StepFinishedEvent {
  return { type: EventType.STEP_FINISHED, stepName, timestamp: now }
}

export function textStart(messageId: string, now = Date.now()): TextMessageStartEvent {
  return { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant", timestamp: now }
}

export function textDelta(messageId: string, delta: string, now = Date.now()): TextMessageContentEvent {
  return { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta, timestamp: now }
}

export function textEnd(messageId: string, now = Date.now()): TextMessageEndEvent {
  return { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now }
}

export function custom(name: AskCustomName, value: unknown, now = Date.now()): AguiCustomEvent {
  return { type: EventType.CUSTOM, name, value, timestamp: now }
}

/* ------------------------------------------------------------------ *
 * TRANSPORT: newline-delimited JSON.
 *
 * NDJSON rather than SSE, following the transport this repository
 * already streams with (app/api/workers/[id]/run). One event per line,
 * no framing to get wrong, and `JSON.parse` per line is the whole
 * decoder. SSE would add a field grammar for no gain here.
 * ------------------------------------------------------------------ */

export const ASK_STREAM_CONTENT_TYPE = "application/x-ndjson"

export function encodeAskEvent(event: AskEvent): string {
  return `${JSON.stringify(event)}\n`
}

/**
 * Parse one line into an event, or null if it is not one.
 *
 * Returns null instead of throwing because this runs over a network
 * stream: a truncated final line is an ordinary way for a connection
 * to end, not an exception worth unwinding a render for. The caller
 * distinguishes "stream ended early" by the absence of RUN_FINISHED,
 * which is the fact that actually matters.
 */
export function decodeAskEvent(line: string): AskEvent | null {
  const trimmed = line.trim()
  if (trimmed === "") return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) return null
  const type = (parsed as { type?: unknown }).type
  if (typeof type !== "string") return null
  if (!KNOWN_EVENT_TYPES.has(type)) return null

  return parsed as AskEvent
}

/** Only the types this stream is specified to carry. An unknown type
 *  is dropped rather than passed to the reducer, so a future producer
 *  adding events cannot make this UI render something it has no
 *  contract for. */
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  EventType.RUN_STARTED,
  EventType.RUN_FINISHED,
  EventType.RUN_ERROR,
  EventType.STEP_STARTED,
  EventType.STEP_FINISHED,
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_END,
  EventType.CUSTOM,
])

/** Splits a growing buffer into whole lines, returning the remainder.
 *  Exported because the chunk boundary is where stream decoders break,
 *  and it is worth testing directly. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n")
  const rest = parts.pop() ?? ""
  return { lines: parts, rest }
}

/* ------------------------------------------------------------------ *
 * A BOUNDED READER.
 *
 * splitLines on its own holds whatever has not yet ended in a newline.
 * A server that sends bytes and never a newline therefore grows that
 * remainder without limit — the consumer keeps appending and never
 * gets a line to hand on. That is a denial of service against the
 * BROWSER, reachable by anything that can answer this request, so the
 * cap belongs in the reader rather than in a caller's discipline.
 *
 * WHERE THE NUMBER COMES FROM. It is derived from the protocol, not
 * chosen for roundness. The largest event this stream emits is
 * keeply.ask.answer, which carries the whole KnowledgeAnswer: the
 * answer text, bounded by MAX_ANSWER_TOKENS (1200 ≈ 4.8 KB), plus the
 * citations, bounded by DEFAULT_CONTEXT_TOKENS (6000 ≈ 24 KB), plus
 * the retrieval report and timings. Measured against a full context
 * budget and a maximum-length answer, that event was 8,305 bytes and
 * the entire stream 17,883 bytes. The theoretical ceiling is ~40 KB.
 *
 * 256 KiB is therefore ~6x the theoretical worst case and ~32x the
 * measured one: no legitimate event can reach it, and a hostile stream
 * is stopped having cost a quarter of a megabyte.
 *
 * BYTES, NOT CHARACTERS. The cap counts the bytes actually received,
 * before decoding. A character count would be wrong twice over: one
 * UTF-8 character can be four bytes, so a character cap does not bound
 * what arrived; and a JS string costs ~2 bytes per code unit, so it
 * does not bound memory either.
 * ------------------------------------------------------------------ */

export const MAX_ASK_EVENT_BYTES = 256 * 1024

/** A single event exceeded MAX_ASK_EVENT_BYTES without ending. Carries
 *  no payload: a hostile stream's content must not reach a log. */
export class AskStreamOverflowError extends Error {
  readonly bytes: number
  constructor(bytes: number, limit: number) {
    super(`A single stream event exceeded ${limit} bytes and was refused.`)
    this.name = "AskStreamOverflowError"
    this.bytes = bytes
  }
}

export interface AskStreamReader {
  /** Decode one chunk and return the events it completed. Throws
   *  AskStreamOverflowError when one unterminated event passes the cap. */
  push(chunk: Uint8Array): AskEvent[]
  /** True when bytes arrived that never completed a line. At EOF that
   *  means the stream was cut mid-event. */
  hasPartial(): boolean
  /** Bytes currently held waiting for a newline. */
  pendingBytes(): number
}

/**
 * The one place the wire is turned into events.
 *
 * It owns the TextDecoder, so a multi-byte character split across two
 * chunks is reassembled rather than corrupted ({ stream: true } keeps
 * the partial sequence). It owns the line splitting, so the cap cannot
 * be bypassed by a caller that forgets it. And it owns decoding, so an
 * unparseable or unknown-type line is dropped exactly once, here.
 */
export function createAskStreamReader(options: { maxEventBytes?: number } = {}): AskStreamReader {
  const limit = options.maxEventBytes ?? MAX_ASK_EVENT_BYTES
  const decoder = new TextDecoder()
  let pending = ""
  /** Bytes received since the last newline — the growth to bound. */
  let pendingByteCount = 0

  const reset = () => {
    // Never keep a refused payload around, and never log it.
    pending = ""
    pendingByteCount = 0
  }

  return {
    push(chunk: Uint8Array): AskEvent[] {
      pendingByteCount += chunk.byteLength
      // { stream: true } holds a multi-byte character that was split
      // across this chunk boundary and completes it on the next one.
      pending += decoder.decode(chunk, { stream: true })

      const { lines, rest } = splitLines(pending)

      if (lines.length === 0) {
        // Nothing completed: everything received is still held, so the
        // running total is the thing to bound.
        if (pendingByteCount > limit) {
          const total = pendingByteCount
          reset()
          throw new AskStreamOverflowError(total, limit)
        }
        return []
      }

      pending = rest

      /* TWO limits, not one. A complete line can be oversized on its
       * own — one enormous event delivered in a single chunk — and the
       * residual can grow across chunks that never contain a newline.
       * Checking only the residual would let the first case through,
       * which an earlier version of this reader did. */
      for (const line of lines) {
        const lineBytes = byteLengthOf(line)
        if (lineBytes > limit) {
          reset()
          throw new AskStreamOverflowError(lineBytes, limit)
        }
      }

      pendingByteCount = byteLengthOf(pending)
      if (pendingByteCount > limit) {
        const total = pendingByteCount
        reset()
        throw new AskStreamOverflowError(total, limit)
      }

      const events: AskEvent[] = []
      for (const line of lines) {
        // An unparseable or unknown-type line is dropped exactly once,
        // here — see decodeAskEvent.
        const event = decodeAskEvent(line)
        if (event) events.push(event)
      }
      return events
    },
    hasPartial: () => pending.length > 0,
    pendingBytes: () => pendingByteCount,
  }
}

function byteLengthOf(text: string): number {
  // No Buffer: this module is browser code.
  return new TextEncoder().encode(text).byteLength
}

/* ------------------------------------------------------------------ *
 * The final answer still travels whole, once, at the end.
 *
 * The events describe HOW the answer was produced; KnowledgeAnswer is
 * WHAT was produced, and it remains the record. Reconstructing it from
 * events in the browser would create a second representation that can
 * disagree with the stored one — which is the drift this file's header
 * warns about, in a different form.
 * ------------------------------------------------------------------ */

export const ASK_ANSWER_CUSTOM = "keeply.ask.answer" as const

export function answerEvent(answer: KnowledgeAnswer, now = Date.now()): AguiCustomEvent {
  return { type: EventType.CUSTOM, name: ASK_ANSWER_CUSTOM, value: answer, timestamp: now }
}

export type { BaseEvent }

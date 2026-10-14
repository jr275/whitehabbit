/* ================================================================== *
 * THE ASK RUN, AS THE BROWSER SEES IT — a pure reducer over the AG-UI
 * event stream.
 *
 * NO "server-only": this is browser code. It is also deliberately
 * pure, with no React in it, because the properties worth protecting
 * here are exactly the ones a component test makes awkward:
 *
 *   - a repeated RUN_STARTED must not reset a run in progress
 *   - a text delta for a messageId that never started must not
 *     materialise a message out of nowhere
 *   - a step must never appear twice, and the four steps are always
 *     present so the UI has no "which steps exist" branch
 *   - a step still open when the run errors is the step that FAILED,
 *     not one still running forever
 *   - a stream that ends without a terminal event is TRUNCATED, which
 *     is a different thing from finished and from failed
 *
 * EVERY FIELD HERE COMES FROM AN EVENT. There is no default that
 * invents a number and no placeholder that stands in for a value the
 * server did not send — the discipline
 * lib/knowledge/use-knowledge-ai.ts already states: a frontend that
 * invents a state is the same failure as an ungrounded answer wearing
 * different clothes.
 *
 * ---- THE TYPES ARE NOT A GUARANTEE HERE ---------------------------
 *
 * This reducer is fed by JSON.parse over a socket, so the AskEvent
 * types describe what SHOULD arrive, not what did. The fields read
 * below are therefore checked at runtime. This is not defensive
 * padding: before the checks, a TEXT_MESSAGE_CONTENT with no delta
 * appended the literal string "undefined" to the answer, and a
 * numeric delta appended "42". Both were reproduced against this file
 * (tests/knowledge/ask-run.test.ts, "a malformed stream").
 * ================================================================== */

import {
  ASK_ANSWER_CUSTOM,
  ASK_CUSTOM,
  ASK_STEPS,
  EventType,
  isAskStepName,
  type AskCitationsPayload,
  type AskEvent,
  type AskEvidencePayload,
  type AskRefusalPayload,
  type AskRetrievalPayload,
  type AskStepName,
  type AskUsagePayload,
} from "./agui"
import type { KnowledgeAnswer } from "./ai"

export type AskStepStatus = "pending" | "running" | "done" | "failed"

export interface AskStepState {
  name: AskStepName
  status: AskStepStatus
  startedAt?: number
  finishedAt?: number
}

/** Running: events are still arriving. Finished/error: a terminal
 *  event arrived. Truncated is recorded separately because a stream
 *  that simply stopped is not the same as one that reported an error,
 *  and telling the user "failed" when the connection dropped is a
 *  different claim than the server made. */
export type AskRunPhase = "idle" | "running" | "finished" | "error"

export interface AskRunState {
  phase: AskRunPhase
  threadId?: string
  runId?: string
  /** Always all four, in pipeline order. */
  steps: AskStepState[]
  /** The accumulated deltas. Empty until a message starts. */
  text: string
  messageId?: string
  textClosed: boolean
  retrieval?: AskRetrievalPayload
  evidence?: AskEvidencePayload
  refusal?: AskRefusalPayload
  citations?: AskCitationsPayload
  usage?: AskUsagePayload
  /** The record, as the server stored it. The UI renders citations and
   *  the final answer from this, not from the reconstructed text. */
  answer?: KnowledgeAnswer
  error?: { message: string; code?: string }
  /** The stream ended with no RUN_FINISHED and no RUN_ERROR. */
  truncated: boolean
}

export function initialAskRunState(): AskRunState {
  return {
    phase: "idle",
    steps: ASK_STEPS.map((name) => ({ name, status: "pending" as AskStepStatus })),
    text: "",
    textClosed: false,
    truncated: false,
  }
}

function withStep(
  steps: AskStepState[],
  name: AskStepName,
  patch: (s: AskStepState) => AskStepState,
): AskStepState[] {
  return steps.map((s) => (s.name === name ? patch(s) : s))
}

/**
 * Fold one event into the state. Pure: returns a new object and never
 * mutates the input.
 *
 * An event that cannot be placed is IGNORED rather than guessed at.
 * That is the whole reason this is a closed switch over a closed union
 * — an unplaceable event is a bug in the producer, and rendering
 * something anyway would hide it.
 */
export function reduceAskEvent(state: AskRunState, event: AskEvent): AskRunState {
  switch (event.type) {
    case EventType.RUN_STARTED: {
      // A second RUN_STARTED on one stream is a producer bug. Resetting
      // here would blank a run the user is watching, so it is ignored.
      if (state.phase !== "idle") return state
      return { ...state, phase: "running", threadId: event.threadId, runId: event.runId }
    }

    case EventType.STEP_STARTED: {
      if (!isAskStepName(event.stepName)) return state
      const current = state.steps.find((s) => s.name === event.stepName)
      // Already started: ignore, so a duplicate cannot restart a clock.
      if (!current || current.status !== "pending") return state
      return {
        ...state,
        steps: withStep(state.steps, event.stepName, (s) => ({
          ...s,
          status: "running",
          startedAt: event.timestamp,
        })),
      }
    }

    case EventType.STEP_FINISHED: {
      if (!isAskStepName(event.stepName)) return state
      const current = state.steps.find((s) => s.name === event.stepName)
      // Finishing a step that never started would be a phantom.
      if (!current || current.status !== "running") return state
      return {
        ...state,
        steps: withStep(state.steps, event.stepName, (s) => ({
          ...s,
          status: "done",
          finishedAt: event.timestamp,
        })),
      }
    }

    case EventType.TEXT_MESSAGE_START: {
      // One message per run. A second start is ignored rather than
      // allowed to discard text already shown.
      if (state.messageId !== undefined) return state
      if (typeof event.messageId !== "string" || event.messageId === "") return state
      return { ...state, messageId: event.messageId, text: "", textClosed: false }
    }

    case EventType.TEXT_MESSAGE_CONTENT: {
      // A delta for a message that never started, or for a different
      // message, would be text from nowhere.
      if (state.messageId !== event.messageId) return state
      if (state.textClosed) return state
      // A missing or non-string delta used to concatenate as
      // "undefined" / "42" — text the server never sent, rendered as
      // part of the answer. Dropped instead.
      if (typeof event.delta !== "string") return state
      return { ...state, text: state.text + event.delta }
    }

    case EventType.TEXT_MESSAGE_END: {
      if (state.messageId !== event.messageId) return state
      return { ...state, textClosed: true }
    }

    case EventType.CUSTOM: {
      switch (event.name) {
        case ASK_CUSTOM.retrieval:
          return { ...state, retrieval: event.value as AskRetrievalPayload }
        case ASK_CUSTOM.evidence:
          return { ...state, evidence: event.value as AskEvidencePayload }
        case ASK_CUSTOM.refusal:
          return { ...state, refusal: event.value as AskRefusalPayload }
        case ASK_CUSTOM.citations:
          return { ...state, citations: event.value as AskCitationsPayload }
        case ASK_CUSTOM.usage:
          return { ...state, usage: event.value as AskUsagePayload }
        case ASK_ANSWER_CUSTOM:
          return { ...state, answer: event.value as KnowledgeAnswer }
        default:
          // A namespaced event this version does not know. Ignored.
          return state
      }
    }

    case EventType.RUN_FINISHED: {
      if (state.phase !== "running") return state
      return { ...state, phase: "finished" }
    }

    case EventType.RUN_ERROR: {
      /* Terminal from "idle" as well as from "running", and that is
       * deliberate. A stream can fail BEFORE RUN_STARTED is processed
       * — an overflowing first chunk, for instance — and requiring
       * "running" meant that error was dropped and the UI sat with
       * four pending steps forever. The invariant that matters is not
       * "a run must have started" but "an already-terminal run is
       * never overwritten", which is what this checks. */
      if (state.phase === "finished" || state.phase === "error") return state
      /* A terminal event must still terminate the run — dropping it
       * would leave a spinner forever — but a message-less RUN_ERROR
       * produced error: {} and the UI rendered an empty block. The
       * generic sentence is this file's only substituted string, and
       * it is substituted for a MISSING value, never for one the
       * server sent. */
      const message =
        typeof event.message === "string" && event.message.trim() !== ""
          ? event.message
          : "Something went wrong. Try again."
      return {
        ...state,
        phase: "error",
        error: { message, code: typeof event.code === "string" ? event.code : undefined },
        // The step that never closed is the one that failed. Leaving it
        // "running" would show a spinner that never stops.
        steps: state.steps.map((s) => (s.status === "running" ? { ...s, status: "failed" } : s)),
      }
    }

    default:
      return state
  }
}

export function reduceAskEvents(events: AskEvent[], from = initialAskRunState()): AskRunState {
  return events.reduce(reduceAskEvent, from)
}

/**
 * Call when the stream has ended, whatever the reason.
 *
 * A run still "running" at end-of-stream was cut off: the connection
 * dropped, the function timed out, the tab was throttled. That is
 * recorded as truncated rather than converted into an error the server
 * never reported — and any step left open stops pretending to run.
 */
export function finalizeAskRun(state: AskRunState): AskRunState {
  if (state.phase !== "running") return state
  return {
    ...state,
    truncated: true,
    steps: state.steps.map((s) => (s.status === "running" ? { ...s, status: "failed" } : s)),
  }
}

/** True while the user should see live progress. Distinguishes a run
 *  happening NOW from an answer restored or re-rendered afterwards —
 *  the two must never look the same. */
export function isAskRunLive(state: AskRunState): boolean {
  return state.phase === "running"
}

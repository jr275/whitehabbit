/* ================================================================== *
 * KNOWLEDGE AI — the wire contract.
 *
 * Deliberately NOT `server-only`. The types below are what
 * POST /api/knowledge/ai returns, and the browser has to compile
 * against the same definition the route produces — otherwise the two
 * drift, silently, in the direction of the UI rendering a field the
 * server stopped sending. lib/knowledge/answer.ts (server) imports its
 * result type from here, so a change to one is a type error in the
 * other.
 *
 * The parser at the bottom is the browser's side of that contract. It
 * exists because "the server returns this shape" is an assumption
 * until something checks it: a proxy that rewrites the body, a
 * deployment mid-rollout, or an error page served with a 200 all
 * arrive as JSON that TypeScript happily believes. Rendering a
 * half-parsed answer as grounded is exactly the failure this whole
 * feature exists to prevent, so a malformed payload becomes a clean
 * error rather than a confident-looking page.
 * ================================================================== */

import type { KnowledgeCitation } from "./search/citations"
import type { RetrievalMode, SemanticDisabledReason, SemanticSearchStatus } from "./search/types"

export type { SemanticDisabledReason, SemanticSearchStatus } from "./search/types"

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === "string"
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const bool = (v: unknown): v is boolean => typeof v === "boolean"

/** Long enough for a real question, short enough that the prompt cost
 *  of one request is bounded. Lives here so the input's maxLength and
 *  the server's 400 are the same number. */
export const MAX_QUESTION_CHARS = 1_000

/** A question shorter than this is treated as a no-op rather than a
 *  search for everything — matching /api/knowledge/search. */
export const MIN_QUESTION_CHARS = 2

const MAX_ITEM_FILTER = 50

export const RETRIEVAL_MODES: RetrievalMode[] = ["lexical", "semantic", "hybrid"]

export interface AskRequest {
  question: string
  mode?: RetrievalMode
  itemIds?: string[]
  includeArchived: boolean
}

/** The request was not something the API can act on. Its message is
 *  shown to the caller, so it says what to fix and nothing else. */
export class InvalidAskRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidAskRequestError"
  }
}

/**
 * Validate a POST /api/knowledge/ai body.
 *
 * Pure, and in the shared contract rather than in the route, for two
 * reasons: the route imports next/server and so cannot be unit tested
 * in this repo's plain-Node runner, and the browser needs the same
 * limits to avoid spending a rate-limit slot on a request it already
 * knows will be rejected.
 *
 * Note what is NOT validated here: scope. Org and user come from the
 * verified session and are applied in SQL beneath every filter, so
 * `itemIds` can only ever narrow. There is deliberately no field in
 * this type through which a caller could name an organization or a
 * user — the shape is the enforcement.
 */
export function parseAskRequest(raw: unknown): AskRequest {
  if (!isObj(raw)) throw new InvalidAskRequestError("Send a JSON object with a question.")

  const question = typeof raw.question === "string" ? raw.question.trim() : ""
  if (question.length < MIN_QUESTION_CHARS) {
    throw new InvalidAskRequestError(`Ask a question of at least ${MIN_QUESTION_CHARS} characters.`)
  }
  if (question.length > MAX_QUESTION_CHARS) {
    throw new InvalidAskRequestError(`A question must be ${MAX_QUESTION_CHARS} characters or fewer.`)
  }

  let mode: RetrievalMode | undefined
  if (raw.mode !== undefined) {
    // An unrecognised mode is a client bug, not a reason to silently
    // answer a different way than was asked for.
    if (typeof raw.mode !== "string" || !RETRIEVAL_MODES.includes(raw.mode as RetrievalMode)) {
      throw new InvalidAskRequestError(`mode must be one of: ${RETRIEVAL_MODES.join(", ")}.`)
    }
    mode = raw.mode as RetrievalMode
  }

  let itemIds: string[] | undefined
  if (raw.itemIds !== undefined) {
    if (!Array.isArray(raw.itemIds) || !raw.itemIds.every((id) => typeof id === "string")) {
      throw new InvalidAskRequestError("itemIds must be an array of item ids.")
    }
    if (raw.itemIds.length > MAX_ITEM_FILTER) {
      throw new InvalidAskRequestError(`itemIds may contain at most ${MAX_ITEM_FILTER} ids.`)
    }
    itemIds = raw.itemIds as string[]
  }

  return { question, mode, itemIds, includeArchived: raw.includeArchived === true }
}

export type AnswerStatus = "answered" | "no_evidence"

export interface AnsweredCitation extends KnowledgeCitation {
  /** Whether the generated answer actually referenced this marker. A
   *  source consulted but not cited is not evidence for anything. */
  used: boolean
}

export interface AnswerRetrievalReport {
  mode: RetrievalMode
  executed: { lexical: boolean; semantic: boolean }
  /** Why semantic retrieval did or did not run. Travels to the browser
   *  so the UI can say "semantic search is not configured" rather than
   *  presenting a lexical-only answer as if the full pipeline ran. A
   *  degraded system that looks healthy is the failure this prevents. */
  semanticSearch: SemanticSearchStatus
  candidates: { lexical: number; semantic: number }
  chunksRetrieved: number
  /** Retrieved but rejected as evidence (see answer.ts's
   *  admissibility rule). chunksRetrieved > 0 with everything
   *  rejected is "the library has neighbours but no sources" — a
   *  different thing to tell the user than "nothing matched". */
  chunksRejected: number
  chunksUsed: number
  droppedChunks: number
  contextTokens: number
}

export interface KnowledgeAnswer {
  status: AnswerStatus
  question: string
  answer: string
  citations: AnsweredCitation[]
  /** Markers the model produced that resolve to no source. Non-empty
   *  means the answer contains a fabricated citation and MUST NOT be
   *  presented as fully grounded. */
  unresolvedCitationIds: string[]
  retrieval: AnswerRetrievalReport
  /** Absent on the refusal path — no model call happened, so there is
   *  no usage to report. Never zero-filled: "not measured" and "cost
   *  nothing" are different facts. */
  usage?: { provider: string; model: string; inputTokens: number; outputTokens: number }
  timings: { retrievalMs: number; generationMs: number; totalMs: number }
}

/* ------------------------------------------------------------------ *
 * Runtime validation.
 * ------------------------------------------------------------------ */

export class MalformedAnswerError extends Error {
  /** Which field failed. For logs, never for the copy a user reads —
   *  written as a plain assignment rather than a parameter property
   *  because this module must stay parseable by node --experimental-
   *  strip-types, which the test runner uses. */
  readonly field: string

  constructor(field: string) {
    super("The server sent an answer this app can't read. Try again.")
    this.name = "MalformedAnswerError"
    this.field = field
  }
}

function citation(raw: unknown, index: number): AnsweredCitation {
  if (!isObj(raw)) throw new MalformedAnswerError(`citations[${index}]`)
  const { citationId, knowledgeItemId, title, chunkIds, used } = raw
  // Every field below is load-bearing for the claim → chunk → item →
  // source chain. A citation missing one of them cannot be verified,
  // and an unverifiable citation is worse than none.
  if (!str(citationId) || !citationId) throw new MalformedAnswerError(`citations[${index}].citationId`)
  if (!str(knowledgeItemId) || !knowledgeItemId) throw new MalformedAnswerError(`citations[${index}].knowledgeItemId`)
  if (!str(title)) throw new MalformedAnswerError(`citations[${index}].title`)
  if (!Array.isArray(chunkIds) || !chunkIds.every(str)) throw new MalformedAnswerError(`citations[${index}].chunkIds`)
  if (!bool(used)) throw new MalformedAnswerError(`citations[${index}].used`)

  return {
    citationId,
    knowledgeItemId,
    title,
    chunkIds: chunkIds as string[],
    used,
    chunkId: str(raw.chunkId) ? raw.chunkId : undefined,
    sourceUrl: str(raw.sourceUrl) ? raw.sourceUrl : undefined,
    excerpt: str(raw.excerpt) ? raw.excerpt : undefined,
    relevanceScore: num(raw.relevanceScore) ? raw.relevanceScore : undefined,
  }
}

const DISABLED_REASONS: SemanticDisabledReason[] = ["not_requested", "provider_not_configured", "provider_error"]

function semanticStatus(raw: unknown): SemanticSearchStatus {
  if (!isObj(raw) || !bool(raw.enabled)) throw new MalformedAnswerError("retrieval.semanticSearch")
  if (raw.enabled) return { enabled: true }
  // An unknown reason must not be rendered: the UI branches on it to
  // tell a configuration gap from an outage, and guessing either way
  // would tell the user something untrue.
  if (!str(raw.reason) || !DISABLED_REASONS.includes(raw.reason as SemanticDisabledReason)) {
    throw new MalformedAnswerError("retrieval.semanticSearch.reason")
  }
  return { enabled: false, reason: raw.reason as SemanticDisabledReason }
}

function retrievalReport(raw: unknown): AnswerRetrievalReport {
  if (!isObj(raw)) throw new MalformedAnswerError("retrieval")
  const { mode, executed, candidates } = raw
  if (mode !== "lexical" && mode !== "semantic" && mode !== "hybrid") throw new MalformedAnswerError("retrieval.mode")
  if (!isObj(executed) || !bool(executed.lexical) || !bool(executed.semantic)) {
    throw new MalformedAnswerError("retrieval.executed")
  }
  if (!isObj(candidates) || !num(candidates.lexical) || !num(candidates.semantic)) {
    throw new MalformedAnswerError("retrieval.candidates")
  }
  const counts = ["chunksRetrieved", "chunksRejected", "chunksUsed", "droppedChunks", "contextTokens"] as const
  for (const key of counts) if (!num(raw[key])) throw new MalformedAnswerError(`retrieval.${key}`)

  return {
    mode,
    executed: { lexical: executed.lexical, semantic: executed.semantic },
    semanticSearch: semanticStatus(raw.semanticSearch),
    candidates: { lexical: candidates.lexical, semantic: candidates.semantic },
    chunksRetrieved: raw.chunksRetrieved as number,
    chunksRejected: raw.chunksRejected as number,
    chunksUsed: raw.chunksUsed as number,
    droppedChunks: raw.droppedChunks as number,
    contextTokens: raw.contextTokens as number,
  }
}

/** Validate a POST /api/knowledge/ai body. Throws MalformedAnswerError
 *  rather than returning a partial object — there is no useful way to
 *  render half an answer, and trying is how a broken payload becomes a
 *  confident-looking page. */
export function parseKnowledgeAnswer(raw: unknown): KnowledgeAnswer {
  if (!isObj(raw)) throw new MalformedAnswerError("body")
  const { status, question, answer, citations, unresolvedCitationIds, retrieval, timings } = raw

  if (status !== "answered" && status !== "no_evidence") throw new MalformedAnswerError("status")
  if (!str(question)) throw new MalformedAnswerError("question")
  if (!str(answer)) throw new MalformedAnswerError("answer")
  // An "answered" response with no text is a broken generation, not an
  // answer. Presenting it would render an empty page with citations
  // attached to nothing.
  if (status === "answered" && answer.trim().length === 0) throw new MalformedAnswerError("answer")
  if (!Array.isArray(citations)) throw new MalformedAnswerError("citations")
  if (!Array.isArray(unresolvedCitationIds) || !unresolvedCitationIds.every(str)) {
    throw new MalformedAnswerError("unresolvedCitationIds")
  }
  if (!isObj(timings) || !num(timings.totalMs)) throw new MalformedAnswerError("timings")

  // Present-but-undefined and absent are different objects, and the
  // refusal path genuinely has no usage key. Building it conditionally
  // keeps a parsed answer round-trip-identical to the body that
  // produced it.
  let usage: KnowledgeAnswer["usage"]
  if (raw.usage !== undefined) {
    const u = raw.usage
    if (!isObj(u) || !str(u.provider) || !str(u.model) || !num(u.inputTokens) || !num(u.outputTokens)) {
      throw new MalformedAnswerError("usage")
    }
    usage = { provider: u.provider, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens }
  }

  return {
    status,
    question,
    answer,
    citations: citations.map(citation),
    unresolvedCitationIds: unresolvedCitationIds as string[],
    retrieval: retrievalReport(retrieval),
    ...(usage ? { usage } : {}),
    timings: {
      retrievalMs: num(timings.retrievalMs) ? timings.retrievalMs : 0,
      generationMs: num(timings.generationMs) ? timings.generationMs : 0,
      totalMs: timings.totalMs,
    },
  }
}

/* ------------------------------------------------------------------ *
 * The state the UI renders. Derived from the response, never invented
 * beside it — every branch below is a fact the backend reported.
 * ------------------------------------------------------------------ */

export type AnswerOutcome =
  /** The model answered, grounded in admissible passages. */
  | { kind: "answered"; answer: KnowledgeAnswer }
  /** Passages were retrieved and every one was rejected as evidence.
   *  The library has neighbours on this topic but nothing that
   *  supports a claim. */
  | { kind: "insufficient_evidence"; answer: KnowledgeAnswer }
  /** Retrieval found nothing at all for this question. */
  | { kind: "no_results"; answer: KnowledgeAnswer }

export function classifyAnswer(answer: KnowledgeAnswer): AnswerOutcome {
  if (answer.status === "answered") return { kind: "answered", answer }
  if (answer.retrieval.chunksRetrieved > 0) return { kind: "insufficient_evidence", answer }
  return { kind: "no_results", answer }
}

/** Is this answer safe to present as grounded? A fabricated marker
 *  makes it not — the text claims support that does not exist, and the
 *  UI must say so rather than render the marker as a link to nowhere. */
export function isFullyGrounded(answer: KnowledgeAnswer): boolean {
  return answer.status === "answered" && answer.unresolvedCitationIds.length === 0
}

/* ------------------------------------------------------------------ *
 * RENDERING THE ANSWER.
 *
 * Splitting the text into tokens is here, not in the component, for
 * one reason: deciding which [n] becomes a clickable source is the
 * grounding guarantee, and a guarantee that lives only inside JSX is a
 * guarantee nothing can test. A marker the model invented rendered as
 * a working link is the most convincing lie this product could tell —
 * it looks exactly like a verified one until someone clicks it.
 * ------------------------------------------------------------------ */

export type AnswerToken =
  | { type: "text"; value: string }
  /** Resolves to a citation the API returned. Safe to link. */
  | { type: "citation"; citationId: string }
  /** A marker with no matching citation. Must never be a link. */
  | { type: "unresolved"; citationId: string }

const MARKER_RE = /\[(\d{1,3})\]/g

export function tokenizeAnswer(text: string, citationIds: Iterable<string>): AnswerToken[] {
  const known = new Set(citationIds)
  const tokens: AnswerToken[] = []
  let cursor = 0

  for (const match of text.matchAll(MARKER_RE)) {
    const start = match.index ?? 0
    if (start > cursor) tokens.push({ type: "text", value: text.slice(cursor, start) })
    const citationId = match[1]
    tokens.push({ type: known.has(citationId) ? "citation" : "unresolved", citationId })
    cursor = start + match[0].length
  }

  if (cursor < text.length) tokens.push({ type: "text", value: text.slice(cursor) })
  return tokens
}

/** Paragraphs, each already tokenized. The model is asked for plain
 *  prose, so a blank line is the only structure honoured — no markdown
 *  is parsed, because rendering model output as markup is how text
 *  derived from arbitrary saved web pages gets to draw its own UI. */
export function paragraphsOf(text: string, citationIds: Iterable<string>): AnswerToken[][] {
  const ids = [...citationIds]
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => tokenizeAnswer(p, ids))
}

/* ================================================================== *
 * RESEARCH — the wire contract.
 *
 * Not `server-only`: the browser compiles against the same definition
 * the route produces, for the same reason lib/knowledge/ai.ts is
 * shared. See that file's header.
 *
 * HOW THIS DIFFERS FROM ASK, since a second surface that answers
 * questions about the library needs to justify itself. Ask takes a
 * QUESTION and returns one grounded answer. Research takes an
 * OBJECTIVE — "I want to understand how companies use AI for payment
 * reconciliation" — and returns a structured brief: a synthesis plus
 * discrete findings, each tied back to the sources that support it.
 * Same retrieval, same grounding rules, different output shape,
 * because "give me an overview of what I know about X" and "what is
 * the answer to X" are different jobs.
 * ================================================================== */

import type { KnowledgeCitation } from "./search/citations"
import type { SemanticSearchStatus } from "./search/types"

export const MAX_OBJECTIVE_CHARS = 1_000
export const MIN_OBJECTIVE_CHARS = 10

export type ResearchStatus = "researched" | "no_evidence"

/** One thing the library actually says about the objective. */
export interface ResearchDiscovery {
  title: string
  finding: string
  /** The model's own ranking, 1 = most important. Displayed as an
   *  ordinal, never as a score — it orders findings within one brief
   *  and means nothing across briefs. */
  importance: number
  /** Citation ids supporting this discovery. Resolved against the
   *  assembled citations before the response leaves the server: a
   *  discovery whose sources do not exist is dropped, not rendered. */
  citationIds: string[]
}

export interface ResearchBrief {
  status: ResearchStatus
  objective: string
  /** The synthesis. Empty only on the refusal path. */
  summary: string
  discoveries: ResearchDiscovery[]
  /** Sources actually drawn on, numbered as the summary cites them. */
  sources: KnowledgeCitation[]
  /** Markers the model invented. Non-empty means the brief must not
   *  be presented as fully grounded. */
  unresolvedCitationIds: string[]
  retrieval: {
    semanticSearch: SemanticSearchStatus
    chunksRetrieved: number
    chunksRejected: number
    chunksUsed: number
    itemsCovered: number
  }
  usage?: { provider: string; model: string; inputTokens: number; outputTokens: number }
  timings: { retrievalMs: number; generationMs: number; totalMs: number }
}

/* ------------------------------------------------------------------ *
 * Request validation. Pure, shared, so the browser enforces the same
 * limits before spending a rate-limit slot the server would reject.
 * ------------------------------------------------------------------ */

export class InvalidObjectiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidObjectiveError"
  }
}

export function parseObjective(raw: unknown): string {
  const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null
  if (!body) throw new InvalidObjectiveError("Send a JSON object with an objective.")

  const objective = typeof body.objective === "string" ? body.objective.trim() : ""
  if (objective.length < MIN_OBJECTIVE_CHARS) {
    throw new InvalidObjectiveError(
      `Describe what you want to understand — at least ${MIN_OBJECTIVE_CHARS} characters.`,
    )
  }
  if (objective.length > MAX_OBJECTIVE_CHARS) {
    throw new InvalidObjectiveError(`An objective must be ${MAX_OBJECTIVE_CHARS} characters or fewer.`)
  }
  // Deliberately nothing else. Scope comes from the session; there is
  // no field here through which a caller could name an org or a user.
  return objective
}

"use client"

/* ================================================================== *
 * KNOWLEDGE CLIENT — the browser's typed access to the real API. This
 * is the ONLY place components talk to the network; they import these
 * functions and the hooks in use-knowledge.ts, never fetch() inline.
 * Errors from the API's structured { error } envelope are surfaced as
 * real Error messages so the UI can show honest failure states.
 * ================================================================== */

import { MalformedAnswerError, parseKnowledgeAnswer, type KnowledgeAnswer } from "./ai"
import { emptyDiscovery, type DiscoveryResult } from "./discovery-contract"
import type { ResearchBrief } from "./research-contract"
import type { KnowledgeDocument, KnowledgeItem, KnowledgeListResult, PrimaryFilter, SearchEvidence } from "./types"
import {
  guestDelete,
  guestGetDocument,
  guestList,
  guestPatch,
  guestRetry,
  guestSaveUrl,
  guestSearch,
} from "./guest-store"

export class KnowledgeApiError extends Error {
  /** The real HTTP status, so a caller can tell a rate limit from an
   *  outage from a bad request. Assigned in the body rather than as a
   *  parameter property because node --experimental-strip-types (this
   *  repo's test runner) cannot parse the latter. */
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "KnowledgeApiError"
    this.status = status
  }
}

/* GUEST FALLBACK ---------------------------------------------------- *
 * When the real API answers 401 (no auth wired / signed out), the app
 * stays fully usable against a browser-local library instead of dead-
 * ending. `isAuthMiss` recognizes that one signal; every public call
 * below runs the real request first and only falls back on it. Any
 * other error (network, 500, validation) propagates untouched so real
 * failures still surface honestly. */
function isAuthMiss(err: unknown): boolean {
  return err instanceof KnowledgeApiError && err.status === 401
}

/** True once the API has told us this browser has no session — flipped
 * on the first 401 so the UI can surface a subtle "Guest mode" hint. */
let guestModeDetected = false
export function isGuestMode(): boolean {
  return guestModeDetected
}
function markGuest(): void {
  guestModeDetected = true
  if (typeof window !== "undefined") window.dispatchEvent(new Event("knowledge:guest"))
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const message = (data?.error as string) || "Something went wrong. Try again."
    throw new KnowledgeApiError(message, res.status)
  }
  return data as T
}

export interface ListParams {
  limit?: number
  offset?: number
  filter?: PrimaryFilter
  kind?: string | null
}

export async function fetchLibrary(params: ListParams = {}, signal?: AbortSignal): Promise<KnowledgeListResult> {
  const qs = new URLSearchParams()
  if (params.limit) qs.set("limit", String(params.limit))
  if (params.offset) qs.set("offset", String(params.offset))
  if (params.filter && params.filter !== "all") qs.set("filter", params.filter)
  if (params.kind) qs.set("kind", params.kind)
  try {
    const res = await fetch(`/api/knowledge?${qs.toString()}`, { signal, cache: "no-store" })
    return await parse<KnowledgeListResult>(res)
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      return guestList(params)
    }
    throw err
  }
}

/** Real search over the org's saved items. Returns [] for queries
 * shorter than 2 chars (the server treats those as an idle no-op). */
export interface LibrarySearchResponse {
  items: KnowledgeItem[]
  /** The passage behind each result, keyed by item id. An item found by
   *  its title has no key here — see SearchEvidence. Kept beside the
   *  items rather than folded into them, because a KnowledgeItem is the
   *  card model used everywhere and must not become query-dependent. */
  evidence: Record<string, SearchEvidence>
}

export async function searchLibrary(q: string, signal?: AbortSignal): Promise<LibrarySearchResponse> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return { items: [], evidence: {} }
  try {
    const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(trimmed)}`, { signal, cache: "no-store" })
    const body = await parse<{ items: KnowledgeItem[]; evidence?: Record<string, SearchEvidence> }>(res)
    return { items: body.items, evidence: body.evidence ?? {} }
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      // A browser-local library has no chunks and no vectors, so a
      // guest search has nothing to show evidence from.
      return { items: guestSearch(trimmed), evidence: {} }
    }
    throw err
  }
}

/** Result of a save: the item, plus whether it was ALREADY in the
 * library (a re-save of the same page). Lets the UI show a discreet
 * "Already in your library" + Open instead of an error or a duplicate. */
export interface SaveResult {
  item: KnowledgeItem
  duplicate: boolean
}

export async function saveUrl(url: string): Promise<SaveResult> {
  try {
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    })
    const data = await parse<{ item: KnowledgeItem; duplicate?: boolean }>(res)
    return { item: data.item, duplicate: data.duplicate === true }
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      return guestSaveUrl(url)
    }
    throw err
  }
}

/**
 * Save a URL into the AUTHENTICATED account, with NO guest fallback.
 *
 * saveUrl() above falls back to the browser-local store on 401, which
 * is right for the ordinary Save button and exactly wrong here: this is
 * the one call whose whole purpose is to move an item OUT of that
 * store. A session that expired mid-import would write the item
 * straight back where it came from and report success, and the import
 * would then delete the local copy it believed it had moved.
 *
 * So a 401 is a real failure here, surfaced like any other. The caller
 * keeps the local item.
 */
export async function saveUrlToAccount(url: string): Promise<SaveResult> {
  const res = await fetch("/api/knowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  })
  const data = await parse<{ item: KnowledgeItem; duplicate?: boolean }>(res)
  return { item: data.item, duplicate: data.duplicate === true }
}

export async function fetchDocument(id: string, signal?: AbortSignal): Promise<KnowledgeDocument> {
  // A guest-created id can't exist server-side; go straight to the store.
  if (id.startsWith("kn_guest_")) {
    const doc = guestGetDocument(id)
    if (!doc) throw new KnowledgeApiError("That item is no longer in your library.", 404)
    return doc
  }
  try {
    const res = await fetch(`/api/knowledge/${id}`, { signal, cache: "no-store" })
    return (await parse<{ document: KnowledgeDocument }>(res)).document
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      const doc = guestGetDocument(id)
      if (!doc) throw new KnowledgeApiError("That item is no longer in your library.", 404)
      return doc
    }
    throw err
  }
}

export async function patchItem(id: string, patch: { favorite?: boolean; archived?: boolean }): Promise<KnowledgeItem> {
  if (id.startsWith("kn_guest_")) return guestPatch(id, patch)
  try {
    const res = await fetch(`/api/knowledge/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
    return (await parse<{ item: KnowledgeItem }>(res)).item
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      return guestPatch(id, patch)
    }
    throw err
  }
}

export async function deleteItem(id: string): Promise<void> {
  if (id.startsWith("kn_guest_")) return guestDelete(id)
  try {
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" })
    await parse<{ ok: true }>(res)
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      return guestDelete(id)
    }
    throw err
  }
}

/** Generates (or returns the cached) AI summary for one item. No guest
 *  fallback, deliberately: guest items have no server-side row and no
 *  session to spend against, so the Reader hides the affordance for
 *  them entirely rather than calling this. */
export async function summarizeItem(id: string): Promise<KnowledgeItem> {
  const res = await fetch(`/api/knowledge/${id}/summarize`, { method: "POST" })
  return (await parse<{ item: KnowledgeItem }>(res)).item
}

/**
 * What one item is about, and what else in the library shares those
 * concepts. Read-only and free — the server derives it from rows the
 * concepts pipeline already wrote, so the Reader can call it on open.
 *
 * Guest items resolve to `unavailable` rather than an error: there is
 * no server-side row to analyze, and a browser-local library has no
 * concept extraction behind it. Saying "not available for local saves"
 * is true; showing "nothing related" would not be.
 */
export async function fetchRelatedKnowledge(id: string, signal?: AbortSignal): Promise<DiscoveryResult> {
  if (id.startsWith("kn_guest_")) return emptyDiscovery(id, "unavailable")
  try {
    const res = await fetch(`/api/knowledge/${id}/related`, { signal, cache: "no-store" })
    return (await parse<{ discovery: DiscoveryResult }>(res)).discovery
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      return emptyDiscovery(id, "unavailable")
    }
    throw err
  }
}

export async function retryItem(id: string): Promise<KnowledgeItem> {
  if (id.startsWith("kn_guest_")) return guestRetry(id)
  try {
    const res = await fetch(`/api/knowledge/${id}/retry`, { method: "POST" })
    return (await parse<{ item: KnowledgeItem }>(res)).item
  } catch (err) {
    if (isAuthMiss(err)) {
      markGuest()
      return guestRetry(id)
    }
    throw err
  }
}

/** Why the ask failed, resolved from the real HTTP status so the UI
 *  can say the true thing. A rate limit shown as "something went
 *  wrong" trains people to retry immediately, which is precisely what
 *  the limit is there to stop. */
export type AskFailureKind =
  | "unauthorized" // 401 — no session
  | "invalid_request" // 400 — the server rejected the question
  | "rate_limited" // 429
  | "provider_unavailable" // 503 — no model credential configured
  | "provider_error" // 502 — the model call failed
  | "malformed_response" // the body did not match the contract
  | "network" // the request never completed
  | "unknown" // 500 and anything unclassified

export interface AskFailure {
  kind: AskFailureKind
  message: string
  /** True when trying the same question again could plausibly work. */
  retryable: boolean
}

/** Exported so the mapping can be tested: showing a rate limit as
 *  "something went wrong" trains people to retry immediately, which is
 *  exactly what the limit exists to stop. */
export function classifyFailure(err: unknown): AskFailure {
  if (err instanceof MalformedAnswerError) {
    return { kind: "malformed_response", message: err.message, retryable: true }
  }
  if (err instanceof KnowledgeApiError) {
    switch (err.status) {
      case 400:
        return { kind: "invalid_request", message: err.message, retryable: false }
      case 401:
        return { kind: "unauthorized", message: "Sign in to ask your library.", retryable: false }
      case 429:
        return { kind: "rate_limited", message: err.message, retryable: true }
      case 502:
        return { kind: "provider_error", message: err.message, retryable: true }
      case 503:
        return { kind: "provider_unavailable", message: err.message, retryable: false }
      default:
        return { kind: "unknown", message: err.message, retryable: true }
    }
  }
  if (err instanceof TypeError) {
    return { kind: "network", message: "Couldn't reach the server. Check your connection.", retryable: true }
  }
  return { kind: "unknown", message: "Something went wrong. Try again.", retryable: true }
}

export interface AskParams {
  /** Restrict the search to specific saved items. Narrows only — the
   *  server applies org and user scope beneath every filter, so this
   *  can never reach something the caller does not own. */
  itemIds?: string[]
  includeArchived?: boolean
}

/** Ask the user's own library a question.
 *
 * NO GUEST FALLBACK, unlike almost everything else in this file. A
 * guest library lives in this browser and has no chunks, no
 * embeddings and no model credential; there is nothing to answer
 * from. A 401 here is a real state the UI must show — falling back
 * would mean inventing an answer, which is the one thing this feature
 * must never do. */
export async function askLibrary(question: string, params: AskParams = {}, signal?: AbortSignal): Promise<KnowledgeAnswer> {
  const res = await fetch("/api/knowledge/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, ...params }),
    signal,
  })
  // parse() raises KnowledgeApiError with the real status, which is
  // what lets the UI tell a rate limit from an outage from a bad
  // request instead of showing one generic failure for all three.
  const body = await parse<unknown>(res)
  return parseKnowledgeAnswer(body)
}

/** Research an objective against the user's own library.
 *
 *  No guest fallback, for the same reason askLibrary has none: a guest
 *  library lives in this browser, has no chunks and no model
 *  credential, and there is nothing to research from. A 401 is a real
 *  state the UI must show. */
export async function researchObjective(objective: string, signal?: AbortSignal): Promise<ResearchBrief> {
  const res = await fetch("/api/knowledge/research", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objective }),
    signal,
  })
  return parse<ResearchBrief>(res)
}

/** An item is still "in flight" while the pipeline runs — the signal
 * the UI uses to decide whether to keep polling. */
export function isProcessing(state: KnowledgeItem["state"]): boolean {
  return state === "saved" || state === "fetching" || state === "extracting"
}

/* ---- indexing status ------------------------------------------------ *
 *
 * The one operational question a Keeply user can ask about their own
 * library: has it been read yet, and if not, why not. Both verbs
 * already existed on /api/knowledge/indexing with no caller — which is
 * why an empty Connections page could not tell "nothing saved" from
 * "not read yet" from "this deployment has no model configured".
 *
 * Scoped to the caller by the route itself. There is no admin mode. */

/** One line per piece of deployment configuration, each naming the
 *  exact environment variables that are missing. Never their values. */
export interface ReadinessCheck {
  id: string
  label: string
  ok: boolean
  missing: string[]
  consequence: string
}

export interface IndexingStatus {
  /** Whether this deployment is finished, and what is missing if not. */
  deployment: { ready: boolean; checks: ReadinessCheck[] }
  /** Whether meaning-based search is available, and why not when it
   *  is not. `provider_not_configured` is a deployment fact, not a
   *  fault in the person's library. */
  semanticSearch: { enabled: boolean; reason?: string }
  embedding: { provider: string; model: string; dimensions: number }
  /** Work outstanding, by why it is outstanding. */
  backlog: {
    total: number
    neverIndexed: number
    staleChunks: number
    neverAnalyzed: number
    neverSummarized: number
    missingVectors: number
  }
  /** Queue depth by real state. `leased` is work in flight — a flat
   *  `queued` with nothing leased means nothing is draining it. */
  jobs: { queued: number; leased: number; failed: number; done: number }
}

export interface BackfillResult {
  candidates: number
  enqueued: number
  alreadyQueued: number
}

export async function fetchIndexingStatus(signal?: AbortSignal): Promise<IndexingStatus> {
  const res = await fetch("/api/knowledge/indexing", { signal, cache: "no-store" })
  return parse<IndexingStatus>(res)
}

/** Queues the outstanding work. Does NOT run it — the existing tick
 *  drains the queue, which is why this creates no second worker. Safe
 *  to call twice: a library that already has queued jobs reports them
 *  as `alreadyQueued` rather than doubling them. */
export async function startBackfill(): Promise<BackfillResult> {
  const res = await fetch("/api/knowledge/indexing", { method: "POST" })
  return parse<BackfillResult>(res)
}

"use client"

/* ================================================================== *
 * KNOWLEDGE CLIENT — the browser's typed access to the real API. This
 * is the ONLY place components talk to the network; they import these
 * functions and the hooks in use-knowledge.ts, never fetch() inline.
 * Errors from the API's structured { error } envelope are surfaced as
 * real Error messages so the UI can show honest failure states.
 * ================================================================== */

import type { KnowledgeDocument, KnowledgeItem, KnowledgeListResult, PrimaryFilter } from "./types"
import {
  guestDelete,
  guestGetDocument,
  guestList,
  guestPatch,
  guestRetry,
  guestSaveUrl,
  guestSearch,
} from "./guest-store"
import { AuthRequiredError, guestFallbackAllowed } from "./auth-state"

export class KnowledgeApiError extends Error {
  // An explicit field rather than a constructor parameter property:
  // identical public shape, but parameter properties are the one piece
  // of TypeScript that node's --experimental-strip-types cannot strip,
  // and this module has to be importable from the test harness for the
  // 401 fork below to be tested against the real code path.
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "KnowledgeApiError"
    this.status = status
  }
}

/* GUEST FALLBACK ---------------------------------------------------- *
 * When the real API answers 401, the app stays fully usable against a
 * browser-local library instead of dead-ending. Every public call below
 * runs the real request first and only falls back on that one signal;
 * any other error (network, 500, validation) propagates untouched so
 * real failures still surface honestly.
 *
 * The fallback is NOT unconditional, and that condition is the point.
 * A 401 means one of two very different things:
 *
 *   - a real guest, who has never signed in here. The local library is
 *     their product. Fall back, exactly as before.
 *   - someone whose session expired. Falling back would silently move
 *     their writes into localStorage while every save still reports
 *     success — they would only discover it on another device, with an
 *     empty library. Throw AuthRequiredError instead, so the UI can ask
 *     them to sign in again.
 *
 * lib/knowledge/auth-state.ts owns that distinction. This function is
 * the single place it is enforced, which is why it throws rather than
 * merely answering: there is no correct way for a caller to see "401,
 * fallback not allowed" and carry on. */
function shouldFallBackToGuest(err: unknown): boolean {
  if (!(err instanceof KnowledgeApiError) || err.status !== 401) return false
  if (!guestFallbackAllowed()) throw new AuthRequiredError()
  return true
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
    if (shouldFallBackToGuest(err)) {
      markGuest()
      return guestList(params)
    }
    throw err
  }
}

/** Real search over the org's saved items. Returns [] for queries
 * shorter than 2 chars (the server treats those as an idle no-op). */
export async function searchLibrary(q: string, signal?: AbortSignal): Promise<KnowledgeItem[]> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return []
  try {
    const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(trimmed)}`, { signal, cache: "no-store" })
    return (await parse<{ items: KnowledgeItem[] }>(res)).items
  } catch (err) {
    if (shouldFallBackToGuest(err)) {
      markGuest()
      return guestSearch(trimmed)
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
    if (shouldFallBackToGuest(err)) {
      markGuest()
      return guestSaveUrl(url)
    }
    throw err
  }
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
    if (shouldFallBackToGuest(err)) {
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
    if (shouldFallBackToGuest(err)) {
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
    if (shouldFallBackToGuest(err)) {
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

export async function retryItem(id: string): Promise<KnowledgeItem> {
  if (id.startsWith("kn_guest_")) return guestRetry(id)
  try {
    const res = await fetch(`/api/knowledge/${id}/retry`, { method: "POST" })
    return (await parse<{ item: KnowledgeItem }>(res)).item
  } catch (err) {
    if (shouldFallBackToGuest(err)) {
      markGuest()
      return guestRetry(id)
    }
    throw err
  }
}

/** An item is still "in flight" while the pipeline runs — the signal
 * the UI uses to decide whether to keep polling. */
export function isProcessing(state: KnowledgeItem["state"]): boolean {
  return state === "saved" || state === "fetching" || state === "extracting"
}

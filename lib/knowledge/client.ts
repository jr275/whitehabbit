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

export class KnowledgeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "KnowledgeApiError"
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
export async function searchLibrary(q: string, signal?: AbortSignal): Promise<KnowledgeItem[]> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return []
  try {
    const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(trimmed)}`, { signal, cache: "no-store" })
    return (await parse<{ items: KnowledgeItem[] }>(res)).items
  } catch (err) {
    if (isAuthMiss(err)) {
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
    if (isAuthMiss(err)) {
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

/** An item is still "in flight" while the pipeline runs — the signal
 * the UI uses to decide whether to keep polling. */
export function isProcessing(state: KnowledgeItem["state"]): boolean {
  return state === "saved" || state === "fetching" || state === "extracting"
}

"use client"

/* ================================================================== *
 * KNOWLEDGE CLIENT — the browser's typed access to the real API. This
 * is the ONLY place components talk to the network; they import these
 * functions and the hooks in use-knowledge.ts, never fetch() inline.
 * Errors from the API's structured { error } envelope are surfaced as
 * real Error messages so the UI can show honest failure states.
 * ================================================================== */

import type { KnowledgeDocument, KnowledgeItem, KnowledgeListResult, PrimaryFilter } from "./types"

export class KnowledgeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "KnowledgeApiError"
  }
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
  const res = await fetch(`/api/knowledge?${qs.toString()}`, { signal, cache: "no-store" })
  return parse<KnowledgeListResult>(res)
}

export async function saveUrl(url: string): Promise<KnowledgeItem> {
  const res = await fetch("/api/knowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  })
  return (await parse<{ item: KnowledgeItem }>(res)).item
}

export async function fetchDocument(id: string, signal?: AbortSignal): Promise<KnowledgeDocument> {
  const res = await fetch(`/api/knowledge/${id}`, { signal, cache: "no-store" })
  return (await parse<{ document: KnowledgeDocument }>(res)).document
}

export async function patchItem(id: string, patch: { favorite?: boolean; archived?: boolean }): Promise<KnowledgeItem> {
  const res = await fetch(`/api/knowledge/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })
  return (await parse<{ item: KnowledgeItem }>(res)).item
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" })
  await parse<{ ok: true }>(res)
}

export async function retryItem(id: string): Promise<KnowledgeItem> {
  const res = await fetch(`/api/knowledge/${id}/retry`, { method: "POST" })
  return (await parse<{ item: KnowledgeItem }>(res)).item
}

/** An item is still "in flight" while the pipeline runs — the signal
 * the UI uses to decide whether to keep polling. */
export function isProcessing(state: KnowledgeItem["state"]): boolean {
  return state === "saved" || state === "fetching" || state === "extracting"
}

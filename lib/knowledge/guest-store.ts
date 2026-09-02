"use client"

/* ================================================================== *
 * GUEST STORE — a browser-local (localStorage) Knowledge library for
 * UNAUTHENTICATED development/testing. It is the honest fallback the
 * client layer (client.ts) uses when the real API answers 401: the
 * product stays fully usable before auth is wired, without faking a
 * user, a session, or backend data.
 *
 * PRINCIPLES
 *  - Reuses the real domain types (KnowledgeItem / KnowledgeDocument)
 *    verbatim, so the UI and the future authenticated backend share one
 *    content model. Nothing here is a parallel/incompatible shape.
 *  - Persists ONLY what the user actually did (saved this URL, starred
 *    it, removed it). It never fabricates a title, author, source,
 *    excerpt, body text or AI summary. A saved link is honestly labelled
 *    "Saved link" with its real URL until real extraction exists.
 *  - Designed to be thrown away: everything lives under one versioned
 *    key and can be exported (exportGuestItems) to migrate into an
 *    authenticated account later. No migration is performed now.
 * ================================================================== */

import type {
  KnowledgeDocument,
  KnowledgeItem,
  KnowledgeKind,
  KnowledgeListResult,
  ListLikeParams,
} from "./types"

const STORAGE_KEY = "knowledge.guest.items.v1"

/** What we persist per item: the full document superset, so the reader
 *  and the library read from one record. Guest docs simply have no
 *  extracted body (contentText/wordCount stay undefined). */
type GuestRecord = KnowledgeDocument

export interface ListLike {
  limit?: number
  offset?: number
  filter?: "all" | "unread" | "read" | "favorites" | "recent"
  kind?: string | null
}

function available(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage
  } catch {
    return false
  }
}

function readAll(): GuestRecord[] {
  if (!available()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as GuestRecord[]) : []
  } catch {
    return []
  }
}

function writeAll(records: GuestRecord[]): void {
  if (!available()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    /* quota / private mode — the session just won't persist */
  }
}

/** Strip the document-only fields to hand a card-level item to the UI. */
function toItem(rec: GuestRecord): KnowledgeItem {
  const {
    contentText: _c,
    publishedAt: _p,
    wordCount: _w,
    attempts: _a,
    ...item
  } = rec
  return item
}

function normalizeUrl(raw: string): URL {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("Paste a URL to save.")
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error("That doesn't look like a valid URL.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links can be saved.")
  }
  if (!url.hostname.includes(".")) throw new Error("That doesn't look like a valid URL.")
  return url
}

/** Honest, URL-derived kind — no page fetch, no invented metadata. */
function detectKind(url: URL): KnowledgeKind {
  const host = url.hostname.replace(/^www\./, "").toLowerCase()
  const path = url.pathname.toLowerCase()
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)$/.test(host)) return "video"
  if (/(^|\.)(x\.com|twitter\.com|threads\.net|bsky\.app|mastodon)/.test(host)) return "social"
  if (path.endsWith(".pdf")) return "pdf"
  return "article"
}

function newId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `kn_guest_${rand}`
}

/* ── Public API (mirrors the shapes client.ts expects) ───────────── */

export function guestList(params: ListLike = {}): KnowledgeListResult {
  const { limit = 24, offset = 0, filter = "all", kind = null } = params
  let records = readAll().filter((r) => !r.archived)

  switch (filter) {
    case "unread":
      records = records.filter((r) => r.readState === "unread")
      break
    case "read":
      records = records.filter((r) => r.readState === "read")
      break
    case "favorites":
      records = records.filter((r) => r.favorite)
      break
    // "all" and "recent" use the default newest-first ordering below
  }
  if (kind) records = records.filter((r) => r.kind === kind)

  records.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())

  const total = records.length
  const page = records.slice(offset, offset + limit)
  const nextOffset = offset + page.length
  return {
    items: page.map(toItem),
    total,
    hasMore: nextOffset < total,
    nextOffset: nextOffset < total ? nextOffset : null,
  }
}

export function guestSearch(q: string): KnowledgeItem[] {
  const needle = q.trim().toLowerCase()
  if (needle.length < 2) return []
  return readAll()
    .filter((r) => !r.archived)
    .filter((r) => {
      const haystack = [r.title, r.url, r.domain, r.source, r.excerpt, ...(r.topics ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(needle)
    })
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .slice(0, 20)
    .map(toItem)
}

export function guestSaveUrl(rawUrl: string): KnowledgeItem {
  const url = normalizeUrl(rawUrl)
  const domain = url.hostname.replace(/^www\./, "")
  const record: GuestRecord = {
    id: newId(),
    kind: detectKind(url),
    // "ready" so the item is immediately usable/openable. There is no
    // pipeline in guest mode, so it never sits in a fake "processing"
    // state — and the reader honestly shows that no text was extracted.
    state: "ready",
    readState: "unread",
    favorite: false,
    archived: false,
    url: url.href,
    domain,
    // No fabricated metadata: an honest placeholder title + the real URL.
    title: "Saved link",
    excerpt: url.href,
    source: domain,
    topics: [],
    savedAt: new Date().toISOString(),
    attempts: 0,
  }
  const records = readAll()
  writeAll([record, ...records])
  return toItem(record)
}

export function guestGetDocument(id: string): KnowledgeDocument | null {
  const rec = readAll().find((r) => r.id === id)
  if (!rec) return null
  // Opening it marks it read, matching the authenticated reader.
  if (rec.readState !== "read") {
    guestPatchRead(id)
    rec.readState = "read"
  }
  return rec
}

function guestPatchRead(id: string): void {
  const records = readAll()
  const next = records.map((r) => (r.id === id ? { ...r, readState: "read" as const } : r))
  writeAll(next)
}

export function guestPatch(id: string, patch: { favorite?: boolean; archived?: boolean }): KnowledgeItem {
  const records = readAll()
  let updated: GuestRecord | null = null
  const next = records.map((r) => {
    if (r.id !== id) return r
    updated = { ...r, ...patch }
    return updated
  })
  writeAll(next)
  if (!updated) throw new Error("That item is no longer in your library.")
  return toItem(updated)
}

export function guestDelete(id: string): void {
  const records = readAll()
  const next = records.filter((r) => r.id !== id)
  if (next.length === records.length) throw new Error("That item is no longer in your library.")
  writeAll(next)
}

/** Guest items are never in a failed/processing state, so retry is a
 *  no-op that simply returns the current item (kept for API parity). */
export function guestRetry(id: string): KnowledgeItem {
  const rec = readAll().find((r) => r.id === id)
  if (!rec) throw new Error("That item is no longer in your library.")
  return toItem(rec)
}

/** Everything the guest has saved — the seam a future "sign in and keep
 *  my items" migration would read from. Not called anywhere yet. */
export function exportGuestItems(): KnowledgeDocument[] {
  return readAll()
}

export function guestCount(): number {
  return readAll().length
}

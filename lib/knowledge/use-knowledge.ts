"use client"

/* ================================================================== *
 * useKnowledgeLibrary — the client state for the Library surface.
 * Owns loading/error/empty/paging state, optimistic favorite/archive/
 * delete, and — crucially — POLLS the real API while any item is still
 * processing, so the honest state machine (saved → fetching →
 * extracting → ready|failed) shows up in the UI without any simulated
 * progress. Polling stops automatically once nothing is in flight.
 * ================================================================== */

import { useCallback, useEffect, useRef, useState } from "react"
import * as api from "./client"
import { GUEST_UPDATED_EVENT } from "./guest-store"
import type { KnowledgeItem, PrimaryFilter } from "./types"

const POLL_INTERVAL_MS = 2000

export interface UseLibraryOptions {
  filter?: PrimaryFilter
  kind?: string | null
  pageSize?: number
}

export interface LibraryState {
  items: KnowledgeItem[]
  status: "loading" | "ready" | "error"
  error: string | null
  total: number
  hasMore: boolean
  loadingMore: boolean
  reload: () => void
  loadMore: () => void
  save: (url: string) => Promise<KnowledgeItem>
  insert: (item: KnowledgeItem) => void
  toggleFavorite: (item: KnowledgeItem) => Promise<void>
  archive: (item: KnowledgeItem) => Promise<void>
  remove: (item: KnowledgeItem) => Promise<void>
  retry: (item: KnowledgeItem) => Promise<void>
}

export function useKnowledgeLibrary(opts: UseLibraryOptions = {}): LibraryState {
  const { filter = "all", kind = null, pageSize = 24 } = opts

  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setStatus((s) => (s === "ready" ? s : "loading"))
      try {
        const res = await api.fetchLibrary({ filter, kind, limit: pageSize, offset: 0 }, signal)
        if (signal?.aborted) return
        setItems(res.items)
        setTotal(res.total)
        setHasMore(res.hasMore)
        setNextOffset(res.nextOffset)
        setError(null)
        setStatus("ready")
      } catch (err) {
        if (signal?.aborted) return
        setError(err instanceof Error ? err.message : "Could not load your library.")
        setStatus("error")
      }
    },
    [filter, kind, pageSize],
  )

  // initial + on filter change
  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  // Poll while anything is processing. A single-flight refresh replaces
  // items in place so cards transition (fetching → ready) without a
  // spinner or reordering.
  useEffect(() => {
    const anyProcessing = items.some((i) => api.isProcessing(i.state))
    if (!anyProcessing) {
      if (pollRef.current) clearTimeout(pollRef.current)
      return
    }
    pollRef.current = setTimeout(async () => {
      try {
        const res = await api.fetchLibrary({ filter, kind, limit: Math.max(pageSize, items.length), offset: 0 })
        setItems(res.items)
        setTotal(res.total)
      } catch {
        /* transient — next tick retries */
      }
    }, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [items, filter, kind, pageSize])

  const reload = useCallback(() => {
    load()
  }, [load])

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await api.fetchLibrary({ filter, kind, limit: pageSize, offset: nextOffset })
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...res.items.filter((i) => !seen.has(i.id))]
      })
      setHasMore(res.hasMore)
      setNextOffset(res.nextOffset)
    } catch {
      /* keep current list; user can retry */
    } finally {
      setLoadingMore(false)
    }
  }, [nextOffset, loadingMore, filter, kind, pageSize])

  const insert = useCallback((item: KnowledgeItem) => {
    // Prepend immediately — it arrives in `saved` state and polling
    // takes over from there.
    setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)])
    setTotal((t) => t + 1)
  }, [])

  const save = useCallback(
    async (url: string) => {
      const { item, duplicate } = await api.saveUrl(url)
      // A duplicate is already in the list — don't insert a second card.
      if (!duplicate) insert(item)
      return item
    },
    [insert],
  )

  // The Save dialog lives in the shell (a separate React tree). When it
  // completes a real save it broadcasts the new item; the Library picks
  // it up here so the card appears and polling starts.
  useEffect(() => {
    function onSaved(e: Event) {
      const detail = (e as CustomEvent<KnowledgeItem>).detail
      if (detail && typeof detail.id === "string") insert(detail)
    }
    window.addEventListener("knowledge:saved", onSaved as EventListener)
    return () => window.removeEventListener("knowledge:saved", onSaved as EventListener)
  }, [insert])

  // Guest thumbnail enrichment/backfill patches items in place (a real
  // title + cover discovered server-side). Merge by id without changing
  // order or total; ignore ids not currently shown. Never fires for
  // authenticated items, so it's a no-op there.
  useEffect(() => {
    function onUpdated(e: Event) {
      const detail = (e as CustomEvent<KnowledgeItem>).detail
      if (!detail || typeof detail.id !== "string") return
      setItems((prev) => prev.map((i) => (i.id === detail.id ? detail : i)))
    }
    window.addEventListener(GUEST_UPDATED_EVENT, onUpdated as EventListener)
    return () => window.removeEventListener(GUEST_UPDATED_EVENT, onUpdated as EventListener)
  }, [])

  const toggleFavorite = useCallback(async (item: KnowledgeItem) => {
    const next = !item.favorite
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, favorite: next } : i)))
    try {
      await api.patchItem(item.id, { favorite: next })
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, favorite: item.favorite } : i)))
    }
  }, [])

  const archive = useCallback(async (item: KnowledgeItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setTotal((t) => Math.max(0, t - 1))
    try {
      await api.patchItem(item.id, { archived: true })
    } catch {
      setItems((prev) => [item, ...prev])
      setTotal((t) => t + 1)
    }
  }, [])

  const remove = useCallback(async (item: KnowledgeItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setTotal((t) => Math.max(0, t - 1))
    try {
      await api.deleteItem(item.id)
    } catch {
      setItems((prev) => [item, ...prev])
      setTotal((t) => t + 1)
    }
  }, [])

  const retry = useCallback(async (item: KnowledgeItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, state: "saved", error: undefined } : i)))
    try {
      const updated = await api.retryItem(item.id)
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
    }
  }, [])

  return { items, status, error, total, hasMore, loadingMore, reload, loadMore, save, insert, toggleFavorite, archive, remove, retry }
}

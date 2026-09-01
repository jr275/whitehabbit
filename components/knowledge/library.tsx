"use client"

/* ================================================================== *
 * LIBRARY — the functional product loop.
 *
 * Save a URL, watch it process, open it, see failures honestly.
 * Milestone 1 is about proving the loop works end to end; visual
 * design comes later.
 *
 * Items still processing are polled individually until they reach a
 * terminal state, then polling stops. Three distinct empty states, per
 * the frontend contract: nothing saved yet, nothing matched, and an
 * error — conflating them is a common and costly mistake.
 * ================================================================== */

import { useCallback, useEffect, useRef, useState } from "react"
import type { KnowledgeItemDto, KnowledgeListResponse, ProcessingResponse } from "@/lib/knowledge/api/contracts"
import { ItemCard } from "./item-card.tsx"
import { SaveForm } from "./save-form.tsx"

const PROCESSING: KnowledgeItemDto["status"][] = ["pending", "fetching", "extracting"]
const POLL_MS = 2000

export function KnowledgeLibrary() {
  const [items, setItems] = useState<KnowledgeItemDto[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (cursor?: string) => {
    try {
      const url = cursor ? `/api/knowledge/items?cursor=${encodeURIComponent(cursor)}` : "/api/knowledge/items"
      const res = await fetch(url)
      if (!res.ok) throw new Error("list failed")
      const data = (await res.json()) as KnowledgeListResponse
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items))
      setNextCursor(data.nextCursor)
      setError(null)
    } catch {
      // Already-loaded cards stay on screen — an error banner must not
      // blank the library.
      setError("We couldn't load your library. Try again.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* Poll only the items that are actually still working. */
  useEffect(() => {
    const pending = items.filter((i) => PROCESSING.includes(i.status))
    if (pending.length === 0) return

    pollTimer.current = setTimeout(async () => {
      const updates = await Promise.all(
        pending.slice(0, 10).map(async (item) => {
          try {
            const res = await fetch(`/api/knowledge/processing/${item.id}`)
            if (!res.ok) return null
            return (await res.json()) as ProcessingResponse
          } catch {
            return null
          }
        }),
      )

      const changed = updates.filter((u): u is ProcessingResponse => u !== null && u.status !== "pending")
      if (changed.length === 0) return

      // A terminal item needs its full record, not just its status.
      const terminal = changed.filter((u) => u.status === "completed" || u.status === "failed")
      if (terminal.length > 0) {
        void load()
      } else {
        setItems((prev) =>
          prev.map((item) => {
            const update = changed.find((u) => u.id === item.id)
            return update ? { ...item, status: update.status, failureMessage: update.failureMessage } : item
          }),
        )
      }
    }, POLL_MS)

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [items, load])

  const onSaved = useCallback((item: KnowledgeItemDto, duplicate: boolean) => {
    setItems((prev) => {
      if (prev.some((existing) => existing.id === item.id)) {
        return duplicate ? prev : prev.map((e) => (e.id === item.id ? item : e))
      }
      return [item, ...prev]
    })
  }, [])

  const onRetry = useCallback(
    async (id: string) => {
      setRetryingId(id)
      try {
        const res = await fetch(`/api/knowledge/items/${id}/retry`, { method: "POST" })
        if (res.ok) {
          setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "pending", failureMessage: null } : i)))
        }
      } finally {
        setRetryingId(null)
      }
    },
    [],
  )

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Library</h1>
        <p className="text-sm text-muted-foreground">
          Save anything from the internet. It gets fetched and read in the background.
        </p>
      </header>

      <SaveForm onSaved={onSaved} />

      {error ? (
        <div role="alert" className="flex items-center justify-between rounded-md border border-destructive/40 px-3 py-2 text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="underline">
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Paste a link above to save your first article.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onRetry={onRetry} retrying={retryingId === item.id} />
          ))}
        </div>
      )}

      {nextCursor ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true)
            void load(nextCursor)
          }}
          className="self-center rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </main>
  )
}

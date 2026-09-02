"use client"

import { AlertCircle, LayoutGrid, Loader2, Rows3, Search, SearchX, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import * as api from "@/lib/knowledge/client"
import { openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeLibrary } from "@/lib/knowledge/use-knowledge"
import type { KnowledgeItem, KnowledgeKind, PrimaryFilter } from "@/lib/knowledge/types"
import { EmptyLibrary } from "./empty-state"
import { KnowledgeCard } from "./knowledge-card"

type LibraryLayout = "grid" | "list"

const KIND_FILTERS: { id: KnowledgeKind; label: string }[] = [
  { id: "article", label: "Articles" },
  { id: "video", label: "Videos" },
  { id: "pdf", label: "PDFs" },
  { id: "podcast", label: "Podcasts" },
  { id: "document", label: "Notes" },
]

const LAYOUTS: { id: LibraryLayout; label: string; icon: typeof LayoutGrid }[] = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "list", label: "List", icon: Rows3 },
]

interface LibraryViewProps {
  /** Locks the primary filter (e.g. Favorites page) and hides the filter row. */
  lockedFilter?: PrimaryFilter
  title?: string
  eyebrow?: string
  subtitle?: string
}

export function LibraryView({
  lockedFilter,
  title = "Library",
  eyebrow,
  subtitle = "Everything you've saved.",
}: LibraryViewProps) {
  const [layout, setLayout] = useState<LibraryLayout>("grid")
  const [kind, setKind] = useState<KnowledgeKind | null>(null)
  const [query, setQuery] = useState("")

  const {
    items,
    status,
    error,
    total,
    hasMore,
    loadingMore,
    reload,
    loadMore,
    toggleFavorite,
    archive,
    remove,
    retry,
  } = useKnowledgeLibrary({ filter: lockedFilter ?? "all", kind })

  // ── Integrated "search my library" ───────────────────────────────
  // Uses the real (guest-aware) search endpoint so it spans the whole
  // library, not just the loaded page. Results reuse the same cards.
  const searching = query.trim().length >= 2
  const [searchResults, setSearchResults] = useState<KnowledgeItem[]>([])
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")

  useEffect(() => {
    if (!searching) {
      setSearchStatus("idle")
      setSearchResults([])
      return
    }
    const ctrl = new AbortController()
    setSearchStatus("loading")
    const t = setTimeout(async () => {
      try {
        const res = await api.searchLibrary(query, ctrl.signal)
        if (ctrl.signal.aborted) return
        setSearchResults(res)
        setSearchStatus("ready")
      } catch {
        if (ctrl.signal.aborted) return
        setSearchStatus("error")
      }
    }, 220)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [query, searching])

  // Optimistic actions for search results (they live outside the hook's list).
  const patchSearch = useCallback((id: string, updater: (i: KnowledgeItem) => KnowledgeItem) => {
    setSearchResults((prev) => prev.map((i) => (i.id === id ? updater(i) : i)))
  }, [])
  const searchFavorite = useCallback(
    (item: KnowledgeItem) => {
      const next = !item.favorite
      patchSearch(item.id, (i) => ({ ...i, favorite: next }))
      api.patchItem(item.id, { favorite: next }).catch(() => patchSearch(item.id, (i) => ({ ...i, favorite: !next })))
    },
    [patchSearch],
  )
  const searchRemove = useCallback((item: KnowledgeItem) => {
    setSearchResults((prev) => prev.filter((i) => i.id !== item.id))
    api.deleteItem(item.id).catch(() => setSearchResults((prev) => [item, ...prev]))
  }, [])
  const searchArchive = useCallback((item: KnowledgeItem) => {
    setSearchResults((prev) => prev.filter((i) => i.id !== item.id))
    api.patchItem(item.id, { archived: true }).catch(() => setSearchResults((prev) => [item, ...prev]))
  }, [])

  const shownSearch = kind ? searchResults.filter((i) => i.kind === kind) : searchResults

  const containerClass =
    layout === "grid" ? "kn-masonry" : "flex flex-col gap-3"

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header — restrained, editorial ───────────────────── */}
      <header className="flex flex-col gap-1.5">
        {eyebrow && <div className="text-sm font-medium text-primary">{eyebrow}</div>}
        <h1 className="text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-[2.75rem]">
          {title}
        </h1>
        <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground">
          {subtitle}
          {!searching && status === "ready" && total > 0 && (
            <span className="text-foreground/70"> · {total} saved</span>
          )}
        </p>
      </header>

      {/* ── Controls — search + type + layout, all quiet ─────── */}
      <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* search */}
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library"
            aria-label="Search your library"
            className="h-10 w-full rounded-full border border-[var(--kn-edge)] bg-card pl-10 pr-9 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/20 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* type filter + layout */}
        <div className="flex items-center justify-between gap-3">
          <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TypeChip active={kind === null} onClick={() => setKind(null)}>
              All
            </TypeChip>
            {KIND_FILTERS.map((k) => (
              <TypeChip key={k.id} active={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>
                {k.label}
              </TypeChip>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--kn-edge)] bg-card/60 p-0.5">
            {LAYOUTS.map((v) => {
              const Icon = v.icon
              return (
                <button
                  key={v.id}
                  onClick={() => setLayout(v.id)}
                  aria-label={`${v.label} view`}
                  aria-pressed={layout === v.id}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-colors",
                    layout === v.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="mt-7">
        {searching ? (
          /* ---- search results ---- */
          searchStatus === "loading" ? (
            <LoadingGrid layout={layout} />
          ) : searchStatus === "error" ? (
            <ErrorState onRetry={() => setQuery((q) => q)} />
          ) : shownSearch.length === 0 ? (
            <NoResults query={query} />
          ) : (
            <>
              <p className="mb-5 text-sm text-muted-foreground">
                {shownSearch.length} {shownSearch.length === 1 ? "result" : "results"} for{" "}
                <span className="font-medium text-foreground">“{query.trim()}”</span>
              </p>
              <div className={containerClass}>
                {shownSearch.map((item, i) => (
                  <KnowledgeCard
                    key={item.id}
                    item={item}
                    view={layout}
                    index={i}
                    onToggleFavorite={searchFavorite}
                    onArchive={searchArchive}
                    onDelete={searchRemove}
                  />
                ))}
              </div>
            </>
          )
        ) : /* ---- browse ---- */ status === "loading" ? (
          <LoadingGrid layout={layout} />
        ) : status === "error" ? (
          <ErrorState message={error ?? undefined} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyLibrary onSave={openSaveDialog} />
        ) : (
          <>
            <div className={containerClass}>
              {items.map((item, i) => (
                <KnowledgeCard
                  key={item.id}
                  item={item}
                  view={layout}
                  index={i}
                  onToggleFavorite={toggleFavorite}
                  onArchive={archive}
                  onDelete={remove}
                  onRetry={retry}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex h-10 items-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground/25 disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="size-4 animate-spin" />}
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors",
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-card px-6 py-20 text-center shadow-sm">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" />
      </span>
      <div>
        <p className="font-serif text-xl font-medium text-foreground">We couldn&apos;t load your library.</p>
        <p className="mx-auto mt-1.5 max-w-xs text-pretty text-sm text-muted-foreground">
          Something went wrong on our end. Give it another try in a moment.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  )
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-card px-6 py-20 text-center shadow-sm">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        <SearchX className="size-6" />
      </span>
      <div>
        <p className="font-serif text-xl font-medium text-foreground">Nothing matches “{query.trim()}”.</p>
        <p className="mx-auto mt-1.5 max-w-xs text-pretty text-sm text-muted-foreground">
          Try a different word, or check the spelling.
        </p>
      </div>
    </div>
  )
}

function LoadingGrid({ layout }: { layout: LibraryLayout }) {
  if (layout === "list") {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex h-28 overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-card shadow-sm"
          >
            <div className="kn-shimmer h-full w-32 shrink-0 sm:w-44" />
            <div className="flex-1 p-4">
              <div className="kn-shimmer h-3 w-24 rounded-full" />
              <div className="kn-shimmer mt-3 h-4 w-2/3 rounded-full" />
              <div className="kn-shimmer mt-2 h-4 w-1/3 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="kn-masonry">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="mb-5 overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-card shadow-sm"
        >
          <div className="kn-shimmer aspect-video w-full" />
          <div className="p-4">
            <div className="kn-shimmer h-3 w-24 rounded-full" />
            <div className="kn-shimmer mt-3 h-5 w-3/4 rounded-full" />
            <div className="kn-shimmer mt-3 h-3 w-full rounded-full" />
            <div className="kn-shimmer mt-2 h-3 w-2/3 rounded-full" style={{ marginBottom: 8 + (i % 3) * 14 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

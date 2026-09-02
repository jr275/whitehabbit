"use client"

import { AlertCircle, LayoutGrid, LayoutList, Loader2, Rows3 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeLibrary } from "@/lib/knowledge/use-knowledge"
import type { KnowledgeKind, PrimaryFilter, ViewMode } from "@/lib/knowledge/types"
import { EmptyLibrary } from "./empty-state"
import { KnowledgeCard } from "./knowledge-card"

const PRIMARY_FILTERS: { id: PrimaryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recently Added" },
]

const KIND_FILTERS: { id: KnowledgeKind; label: string }[] = [
  { id: "article", label: "Articles" },
  { id: "video", label: "Videos" },
  { id: "pdf", label: "PDFs" },
  { id: "podcast", label: "Podcasts" },
  { id: "document", label: "Documents" },
]

const VIEWS: { id: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: "masonry", label: "Masonry", icon: Rows3 },
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "list", label: "List", icon: LayoutList },
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
  title = "Your Library",
  eyebrow,
  subtitle = "Your personal knowledge, organized automatically.",
}: LibraryViewProps) {
  const [view, setView] = useState<ViewMode>("masonry")
  const [primary, setPrimary] = useState<PrimaryFilter>(lockedFilter ?? "all")
  const [kind, setKind] = useState<KnowledgeKind | null>(null)

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
  } = useKnowledgeLibrary({ filter: primary, kind })

  const showFilters = !lockedFilter

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-2">
        {eyebrow && <div className="text-sm font-medium text-primary">{eyebrow}</div>}
        <h1 className="text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
          {subtitle}
          {status === "ready" && total > 0 && (
            <span className="text-foreground"> · {total} saved</span>
          )}
        </p>
      </header>

      {/* ── Controls ─────────────────────────────────────── */}
      <div className="mt-10 flex flex-col gap-4 border-b border-[var(--kn-edge)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {showFilters ? (
            <div className="flex flex-wrap items-center gap-1">
              {PRIMARY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setPrimary(f.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    primary === f.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}

          {/* view switcher */}
          <div className="flex items-center gap-0.5 rounded-lg border border-[var(--kn-edge)] bg-card/50 p-0.5">
            {VIEWS.map((v) => {
              const Icon = v.icon
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  aria-label={v.label}
                  aria-pressed={view === v.id}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md transition-colors",
                    view === v.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
          </div>
        </div>

        {/* content types */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setKind(null)}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] transition-colors",
              kind === null
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All types
          </button>
          {KIND_FILTERS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(kind === k.id ? null : k.id)}
              className={cn(
                "rounded-full px-3 py-1 text-[13px] transition-colors",
                kind === k.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Items ────────────────────────────────────────── */}
      <div className="mt-6">
        {status === "loading" ? (
          <LoadingGrid />
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-16 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div>
              <p className="text-sm font-medium text-foreground">We couldn&apos;t load your library.</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            </div>
            <button
              onClick={reload}
              className="h-9 rounded-lg border border-border px-4 text-sm text-foreground hover:bg-secondary"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyLibrary onSave={openSaveDialog} />
        ) : (
          <>
            <div
              className={cn(
                view === "masonry" && "kn-masonry",
                view === "grid" && "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                view === "list" && "flex flex-col gap-3",
              )}
            >
              {items.map((item, i) => (
                <KnowledgeCard
                  key={item.id}
                  item={item}
                  view={view}
                  index={i}
                  onToggleFavorite={toggleFavorite}
                  onArchive={archive}
                  onDelete={remove}
                  onRetry={retry}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex h-10 items-center gap-2 rounded-xl border border-border px-5 text-sm text-foreground hover:bg-secondary disabled:opacity-50"
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

function LoadingGrid() {
  return (
    <div className="kn-masonry">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="mb-5 overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)]"
          style={{ height: 220 + (i % 3) * 60 }}
        >
          <div className="kn-shimmer h-full w-full" />
        </div>
      ))}
    </div>
  )
}

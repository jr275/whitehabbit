"use client"

import { LayoutGrid, LayoutList, Rows3, TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { openSaveDialog } from "@/lib/knowledge/config"
import type {
  Collection,
  Insight,
  KnowledgeItem,
  KnowledgeKind,
  PrimaryFilter,
  Topic,
  ViewMode,
} from "@/lib/knowledge/types"
import { AskLibrary } from "./ask-library"
import { EmptyLibrary } from "./empty-state"
import { CollectionsRail, DailyIntelligence, RecentInterests } from "./intelligence"
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
  items: KnowledgeItem[]
  collections: Collection[]
  topics: Topic[]
  insights: Insight[]
  savedThisWeek: number
}

export function LibraryView({
  items,
  collections,
  topics,
  insights,
  savedThisWeek,
}: LibraryViewProps) {
  const [view, setView] = useState<ViewMode>("masonry")
  const [primary, setPrimary] = useState<PrimaryFilter>("all")
  const [kind, setKind] = useState<KnowledgeKind | null>(null)
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.favorite])),
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [archived, setArchived] = useState<Set<string>>(new Set())

  const enriched = useMemo(
    () => items.map((i) => ({ ...i, favorite: favorites[i.id] ?? i.favorite })),
    [items, favorites],
  )

  const filtered = useMemo(() => {
    let list = enriched.filter((i) => !archived.has(i.id))
    if (primary === "unread") list = list.filter((i) => i.readState === "unread")
    if (primary === "read") list = list.filter((i) => i.readState === "read")
    if (primary === "favorites") list = list.filter((i) => i.favorite)
    if (primary === "recent")
      list = [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    if (kind) list = list.filter((i) => i.kind === kind)
    return list
  }, [enriched, primary, kind, archived])

  function toggleFavorite(id: string) {
    setFavorites((f) => ({ ...f, [id]: !f[id] }))
  }
  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function archive(id: string) {
    setArchived((s) => new Set(s).add(id))
    setSelected((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
  }

  const topInterests = ["AI Agents", "Product", "Startups"]

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          <TrendingUp className="size-3.5 text-grow" />
          You saved {savedThisWeek} things this week
        </div>
        <h1 className="text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Your Library
        </h1>
        <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
          Your personal knowledge, organized automatically.
        </p>
      </header>

      {/* ── Intelligence row ─────────────────────────────── */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <AskLibrary />
        <RecentInterests topics={topInterests} count={7} />
      </div>

      {/* ── Controls ─────────────────────────────────────── */}
      <div className="mt-10 flex flex-col gap-4 border-b border-[var(--kn-edge)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* primary filters */}
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
              "rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
              kind === null
                ? "bg-[var(--kn-ai)]/15 text-[var(--kn-ai)]"
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
                "rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                kind === k.id
                  ? "border-[var(--kn-ai)]/30 bg-[var(--kn-ai)]/10 text-[var(--kn-ai)]"
                  : "border-[var(--kn-edge)] text-muted-foreground hover:text-foreground",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* selection bar */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">{selected.size} selected</span>
          <button className="text-muted-foreground hover:text-foreground">Add to collection</button>
          <button className="text-muted-foreground hover:text-foreground">Archive</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-muted-foreground hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      {/* ── Items ────────────────────────────────────────── */}
      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyLibrary onSave={openSaveDialog} />
        ) : view === "masonry" ? (
          <div className="kn-masonry">
            {filtered.map((item, i) => (
              <KnowledgeCard
                key={item.id}
                item={item}
                view="masonry"
                index={i}
                selected={selected.has(item.id)}
                onToggleFavorite={toggleFavorite}
                onArchive={archive}
                onSelect={toggleSelect}
              />
            ))}
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item, i) => (
              <KnowledgeCard
                key={item.id}
                item={item}
                view="grid"
                index={i}
                selected={selected.has(item.id)}
                onToggleFavorite={toggleFavorite}
                onArchive={archive}
                onSelect={toggleSelect}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((item, i) => (
              <KnowledgeCard
                key={item.id}
                item={item}
                view="list"
                index={i}
                selected={selected.has(item.id)}
                onToggleFavorite={toggleFavorite}
                onArchive={archive}
                onSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Daily intelligence + collections ─────────────── */}
      <div className="mt-14 space-y-12">
        <DailyIntelligence insights={insights} />
        <CollectionsRail collections={collections} />
      </div>
    </div>
  )
}

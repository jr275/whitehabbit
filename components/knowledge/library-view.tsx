"use client"

import { Loader2, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import * as api from "@/lib/knowledge/client"
import { openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeLibrary } from "@/lib/knowledge/use-knowledge"
import { useVoiceSearch } from "@/lib/knowledge/use-voice-search"
import type { KnowledgeItem, KnowledgeKind, PrimaryFilter, SearchEvidence } from "@/lib/knowledge/types"
import { EmptyLibrary } from "./empty-state"
import { ItemRow, ItemRows } from "./item-row"
import { VoiceSearchButton } from "./voice-search-button"

/* Lightweight session persistence so returning from the Reader keeps the
 * user's place: view mode, type filter and search. Scoped to sessionStorage
 * (not URL) to stay invisible and disposable; view mode persists globally
 * while filter/search are only restored on the main (unlocked) Library. */
const SS = { kind: "kn:lib:kind", query: "kn:lib:query" } as const

function ssGet(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function ssSet(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    /* private mode / quota — persistence is best-effort */
  }
}

const KIND_FILTERS: { id: KnowledgeKind; label: string }[] = [
  { id: "article", label: "Articles" },
  { id: "video", label: "Videos" },
  { id: "pdf", label: "PDFs" },
  { id: "podcast", label: "Podcasts" },
  { id: "document", label: "Notes" },
]

interface LibraryViewProps {
  /** Locks the primary filter (e.g. Favorites page) and hides the filter row. */
  lockedFilter?: PrimaryFilter
  title?: string
  eyebrow?: string
  subtitle?: string
  /** Search the Library opens on, from ?q= in the URL. Empty means the
   *  ordinary browse view. */
  initialQuery?: string
}

export function LibraryView({
  lockedFilter,
  title = "Library",
  eyebrow,
  subtitle = "Everything you've saved.",
  initialQuery = "",
}: LibraryViewProps) {
  // Initialise to SSR-safe defaults so the server-rendered HTML and the
  // first client render match exactly. The persisted view mode / filter /
  // search are restored from sessionStorage AFTER mount (effect below),
  // which keeps the Reader → Library return seamless without triggering a
  // hydration mismatch for returning users (e.g. one whose last visit was
  // in list view).
  const [kind, setKind] = useState<KnowledgeKind | null>(null)
  /* ?q= makes a filtered Library a link someone can send — and, more
   * immediately, gives a Topic card somewhere to go. searchItems
   * already matches an item's tags, so a topic's own name IS the query
   * that finds its items: no tag-filter endpoint, no second code path,
   * and the results arrive through the hybrid search everything else
   * uses. */
  const [query, setQuery] = useState(initialQuery)
  const [hydrated, setHydrated] = useState(false)

  // ── Voice search — a browser capability, not a new search engine ──
  // A final transcript REPLACES whatever is in the box (the modern
  // convention — a fresh dictation, not an append) and the existing
  // debounced search effect below picks it up exactly as if it had
  // been typed. See lib/knowledge/voice-search.ts for the real state
  // machine; this component only ever reads its state and calls
  // start()/stop().
  const voice = useVoiceSearch((transcript) => setQuery(transcript))
  const voiceBusy = voice.state === "listening" || voice.state === "processing"

  // Restore prior context once, on the client, after the first paint.
  // View mode is restored always; filter/search only on the main Library,
  // so locked pages (e.g. Favorites) never inherit a stray one.
  useEffect(() => {
    if (!lockedFilter) {
      const savedKind = ssGet(SS.kind) as KnowledgeKind | null
      if (savedKind) setKind(savedKind)
      const savedQuery = ssGet(SS.query)
      if (savedQuery) setQuery(savedQuery)
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist context as it changes so the Reader → Library return is
  // seamless. Gated on `hydrated` so the pre-restore defaults never
  // clobber the stored values during the initial mount.
  useEffect(() => {
    if (hydrated && !lockedFilter) ssSet(SS.kind, kind ?? "")
  }, [kind, lockedFilter, hydrated])
  useEffect(() => {
    if (hydrated && !lockedFilter) ssSet(SS.query, query)
  }, [query, lockedFilter, hydrated])

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
  /** Why each search result is here, keyed by item id. Empty for a
   *  lexical-only match, and empty for every non-search view — a card
   *  outside a search has no query to have matched. */
  const [searchEvidence, setSearchEvidence] = useState<Record<string, SearchEvidence>>({})
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  /** Bumped by "Try again" after a failed search. A retry runs the same
   *  query, and setting state to the value it already holds is a no-op in
   *  React — the effect below would never re-run and the button would do
   *  nothing. Counting the attempt is what gives the retry something to
   *  depend on. */
  const [searchAttempt, setSearchAttempt] = useState(0)

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
        setSearchResults(res.items)
        setSearchEvidence(res.evidence)
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
  }, [query, searching, searchAttempt])

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

  /* One presentation for one kind of thing. A library is a list of
   * saved pieces; a search is the same list, narrowed, with the passage
   * that matched shown in place of the excerpt. Making them look
   * different would suggest they are different objects. */
  const shown = searching ? shownSearch : items

  return (
    <div className="pk-page pb-24">
      {/* ── Masthead ──────────────────────────────────────────────
          The field is the centre of gravity, not a control in a filter
          row: on a knowledge product, finding is the primary act and
          browsing is what you do when you do not yet know the word. */}
      <header className="pt-14 sm:pt-20">
        {eyebrow && <p className="pk-label">{eyebrow}</p>}
        <h1 className="pk-display mt-4 text-[var(--pk-ink)]">{title}</h1>
        <p className="pk-meta mt-4">
          {subtitle}
          {!searching && status === "ready" && total > 0 && ` · ${total.toLocaleString()} saved`}
        </p>

        <div className="mt-8 max-w-[38rem]">
          <div className="pk-field">
            <Search className="size-[18px] shrink-0 text-[var(--pk-ink-4)]" strokeWidth={1.8} />
            <input
              type="search"
              value={
                voiceBusy
                  ? voice.interimTranscript || (voice.state === "listening" ? "Listening…" : "Processing…")
                  : query
              }
              onChange={(e) => setQuery(e.target.value)}
              readOnly={voiceBusy}
              placeholder="Search your knowledge"
              aria-label="Search your knowledge"
              className={cn("[&::-webkit-search-cancel-button]:appearance-none", voiceBusy && "text-[var(--pk-ink-3)]")}
            />
            {query && !voiceBusy && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--pk-ink-4)] transition-colors hover:text-[var(--pk-ink)]"
              >
                <X className="size-3.5" />
              </button>
            )}
            <VoiceSearchButton voice={voice} className="shrink-0" />
          </div>

          {voice.message && (
            <p role="status" className="pk-meta mt-2.5">
              {voice.message}
            </p>
          )}
        </div>
      </header>

      {/* ── Type filter — words, not pills ──────────────────────── */}
      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--pk-rule)] pb-4">
        <TypeChip active={kind === null} onClick={() => setKind(null)}>
          All
        </TypeChip>
        {KIND_FILTERS.map((k) => (
          <TypeChip key={k.id} active={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>
            {k.label}
          </TypeChip>
        ))}
      </div>

      <div className="mt-2">
        {searching && searchStatus === "ready" && shownSearch.length > 0 && (
          <p className="pk-label py-4">
            {shownSearch.length} {shownSearch.length === 1 ? "result" : "results"} · {query.trim()}
          </p>
        )}

        {searching ? (
          searchStatus === "loading" ? (
            <LoadingRows />
          ) : searchStatus === "error" ? (
            <Notice
              title="That search didn’t complete."
              body="Something went wrong on our end."
              action={{ label: "Try again", onClick: () => setSearchAttempt((n) => n + 1) }}
            />
          ) : shownSearch.length === 0 ? (
            <Notice
              title={`Nothing matches “${query.trim()}”.`}
              body="Try a different word, or check the spelling."
            />
          ) : (
            <ItemRows>
              {shown.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  evidence={searchEvidence[item.id] ? <Evidence evidence={searchEvidence[item.id]} /> : undefined}
                  onToggleFavorite={searchFavorite}
                />
              ))}
            </ItemRows>
          )
        ) : status === "loading" ? (
          <LoadingRows />
        ) : status === "error" ? (
          <Notice
            title="We couldn’t load your library."
            body={error ?? "Something went wrong on our end."}
            action={{ label: "Try again", onClick: reload }}
          />
        ) : items.length === 0 ? (
          <div className="pt-10">
            <EmptyLibrary onSave={openSaveDialog} />
          </div>
        ) : (
          <>
            <ItemRows>
              {shown.map((item) => (
                <ItemRow key={item.id} item={item} onToggleFavorite={toggleFavorite} onRetry={retry} />
              ))}
            </ItemRows>

            {hasMore && (
              <div className="mt-8">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex h-9 items-center gap-2 text-[13.5px] text-[var(--pk-ink-2)] underline decoration-[var(--pk-rule-2)] underline-offset-4 transition-colors hover:text-[var(--pk-ink)] disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
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

/** The passage that matched, with where in the piece it sits. Marked by
 *  the evidence rule — the one colour in Keeply that means "this is the
 *  text your result came from", never decoration. */
function Evidence({ evidence }: { evidence: SearchEvidence }) {
  return (
    <>
      <span className="pk-label mb-1.5 block text-[var(--pk-evidence)]">Matched passage</span>
      <p className="line-clamp-3">{evidence.snippet}</p>
    </>
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
      aria-pressed={active}
      className={cn(
        "pk-label shrink-0 whitespace-nowrap transition-colors",
        active ? "text-[var(--pk-ink)]" : "hover:text-[var(--pk-ink-2)]",
      )}
    >
      {children}
    </button>
  )
}

/** Every non-result state: an error, an empty search. One line of ink
 *  and one of grey — a dashed panel with an icon in a rounded square is
 *  chrome built to announce the absence of content. */
function Notice({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="max-w-[46ch] py-16">
      <p className="text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)]">{title}</p>
      <p className="mt-2 text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">{body}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="pk-rows" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border-b border-[var(--pk-rule)] py-[1.125rem]">
          <div className="kn-shimmer h-2.5 w-28 rounded-full bg-[var(--pk-sunken)]" />
          <div className="kn-shimmer mt-3 h-4 w-2/3 rounded-full bg-[var(--pk-sunken)]" />
          <div className="kn-shimmer mt-2.5 h-3 w-1/3 rounded-full bg-[var(--pk-sunken)]" />
        </div>
      ))}
    </div>
  )
}

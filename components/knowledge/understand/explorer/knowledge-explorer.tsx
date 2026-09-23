"use client"

/* ================================================================== *
 * EXPLORER — the plain mode, after the argument has been made.
 *
 * The narrative above earns the right to be editorial; this section
 * has to be fast and legible, because it is where someone actually
 * looks something up. So it drops the storytelling: a filter row, a
 * sort, and a dense list.
 *
 * It is still not a card grid. Rows carry more information per pixel
 * and — more importantly — keep titles on a common left edge, which is
 * what makes a list of fifteen scannable at all.
 * ================================================================== */

import Link from "next/link"
import { askAboutConceptHref } from "@/lib/knowledge/links"
import { useMemo, useState } from "react"
import type { KnowledgeConcept, KnowledgeObject, KnowledgeObjectKind } from "@/lib/knowledge/understand/types"
import { cn } from "@/lib/utils"

type Filter = "all" | KnowledgeObjectKind
type Sort = "recent" | "relevant" | "revisited"

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "article", label: "Articles" },
  { id: "video", label: "Videos" },
  { id: "pdf", label: "PDFs" },
  { id: "podcast", label: "Podcasts" },
  { id: "social", label: "Posts" },
  { id: "document", label: "Notes" },
]

const KIND_LABEL: Record<KnowledgeObjectKind, string> = {
  article: "Article",
  video: "Video",
  pdf: "PDF",
  podcast: "Podcast",
  social: "Post",
  document: "Note",
}

/* Only offer a sort the data can actually perform. "Relevant" and
 * "most revisited" are measures of the sample library; a real item has
 * neither a relevance score nor a revisit COUNT (the schema keeps a
 * last-read timestamp, which is a different thing). Offering them over
 * live data would produce a control that reorders nothing, which reads
 * as a bug rather than as an absence. */
const ALL_SORTS: { id: Sort; label: string; needs: keyof KnowledgeObject | null }[] = [
  { id: "recent", label: "Recent", needs: null },
  { id: "relevant", label: "Relevant", needs: "relevance" },
  { id: "revisited", label: "Most revisited", needs: "revisits" },
]

export interface ExplorerProps {
  objects: KnowledgeObject[]
  concepts: KnowledgeConcept[]
  onOpen: (id: string) => void
  onAsk: (question: string) => void
  onExploreConnections: () => void
  /** Concept the view opened on — from ?concept= in the URL, so a
   *  filtered Explorer is a link someone can send. */
  selectedConceptId?: string | null
  onSelectConcept?: (conceptId: string | null) => void
  /** How many items the library holds in total. Larger than
   *  objects.length means this is a page of it, and the surface says
   *  so instead of presenting a subset as the whole. */
  total?: number
  /** A real data-access failure. Rendered as a failure — never as an
   *  empty library, which would tell someone their saves are gone. */
  error?: boolean
  /** Whether these rows are the viewer's own. Drives which of the
   *  empty states can honestly be shown. */
  live?: boolean
}

export function KnowledgeExplorer({
  objects,
  concepts,
  onOpen,
  onAsk,
  onExploreConnections,
  selectedConceptId = null,
  onSelectConcept,
  total,
  error = false,
  live = false,
}: ExplorerProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("recent")
  const [query, setQuery] = useState("")

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts])

  // Concepts, strongest first, ties broken by name so the rail is the
  // same on every render and in every process. A rail that reshuffles
  // between visits is unusable as a way back to something.
  const rail = useMemo(
    () => [...concepts].sort((a, b) => b.itemCount - a.itemCount || a.label.localeCompare(b.label)),
    [concepts],
  )

  const sorts = useMemo(
    () => ALL_SORTS.filter((s) => s.needs === null || objects.some((o) => o[s.needs!] !== undefined)),
    [objects],
  )
  const activeSort = sorts.some((s) => s.id === sort) ? sort : "recent"

  const byConcept = useMemo(
    () => (selectedConceptId ? objects.filter((o) => o.conceptIds.includes(selectedConceptId)) : objects),
    [objects, selectedConceptId],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = byConcept.filter((o) => {
      if (filter !== "all" && o.kind !== filter) return false
      if (!q) return true
      // Concept labels are searched too — a person looking for "memory"
      // means the idea, not only the word in a title.
      const haystack = [o.title, o.source, ...o.conceptIds.map((id) => conceptById.get(id)?.label ?? "")]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
    return [...filtered].sort((a, b) => {
      if (activeSort === "relevant") return (b.relevance ?? 0) - (a.relevance ?? 0)
      if (activeSort === "revisited") return (b.revisits ?? 0) - (a.revisits ?? 0)
      // Recent, with the id as a tie-break: two things saved in the
      // same second must not swap places between renders.
      return b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id)
    })
  }, [byConcept, filter, activeSort, query, conceptById])

  const selectedConcept = selectedConceptId ? conceptById.get(selectedConceptId) : undefined

  /* ---- the states, each a different fact ------------------------- */

  if (error) {
    return (
      <p className="py-16 text-center text-[15px] text-[var(--kp-ink-faint)]">
        Your library could not be loaded just now. Nothing has been lost — reload to try again.
      </p>
    )
  }

  if (live && objects.length === 0) {
    return (
      <p className="py-16 text-center text-[15px] text-[var(--kp-ink-faint)]">
        Nothing saved yet. Save a link and it will appear here.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-[var(--kp-rule)] py-3">
        <div role="group" aria-label="Filter by type" className="kp-scroll-x flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--kp-fast)]",
                filter === f.id
                  ? "bg-[var(--kp-ink)] text-[var(--kp-paper)]"
                  : "text-[var(--kp-ink-faint)] hover:text-[var(--kp-ink)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-4">
          <div className="min-w-0 flex-1 sm:max-w-[240px]">
            <label htmlFor="kp-explorer-search" className="sr-only">
              Search your library
            </label>
            <input
              id="kp-explorer-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full border-b border-[var(--kp-rule)] bg-transparent py-1.5 text-[14px] placeholder:text-[var(--kp-ink-faint)] focus:border-[var(--kp-accent)] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="kp-explorer-sort" className="sr-only">
              Sort by
            </label>
            <select
              id="kp-explorer-sort"
              value={activeSort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="cursor-pointer border-b border-[var(--kp-rule)] bg-transparent py-1.5 text-[13px] text-[var(--kp-ink-soft)] focus:border-[var(--kp-accent)] focus:outline-none"
            >
              {sorts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* THE CONCEPT RAIL — the Explorer's spine, and the thing that
          makes this a knowledge map rather than a file list. Selecting
          one narrows the list below to what it was found in; selecting
          it again clears. Counts are the number of items the concept
          appears in, not a score. */}
      {onSelectConcept && (
        <div className="mt-5">
          {rail.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-[var(--kp-ink-faint)]">
              {live
                ? "Keeply hasn’t read these yet. The ideas it finds will appear here as it does."
                : "No concepts in this sample."}
            </p>
          ) : (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--kp-ink-faint)]">
                Ideas in your library
              </p>
              <ul className="kp-scroll-x mt-2.5 flex flex-wrap gap-1.5" aria-label="Filter by concept">
                {rail.map((concept) => {
                  const active = concept.id === selectedConceptId
                  return (
                    <li key={concept.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelectConcept(active ? null : concept.id)}
                        className={cn(
                          "whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] transition-colors duration-[var(--kp-fast)]",
                          active
                            ? "border-[var(--kp-accent)] bg-[var(--kp-accent)] text-[var(--kp-paper)]"
                            : "border-[var(--kp-rule)] text-[var(--kp-ink-soft)] hover:border-[var(--kp-ink)] hover:text-[var(--kp-ink)]",
                        )}
                      >
                        {concept.label}
                        <span className={cn("ml-1.5 kp-tnum", active ? "opacity-70" : "text-[var(--kp-ink-faint)]")}>
                          {concept.itemCount}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[12.5px] text-[var(--kp-ink-faint)]" aria-live="polite">
          {visible.length} of {objects.length} shown
          {selectedConcept && <> · filtered by {selectedConcept.label}</>}
          {typeof total === "number" && total > objects.length && (
            <> · showing the {objects.length} most recent of {total} saved</>
          )}
        </p>
        {/* When a concept IS the subject, it can be asked about. Same
            Ask, same deterministic phrasing as everywhere else — no
            second question system, and no model consulted to write a
            question about a concept the extractor already named. */}
        {selectedConcept && live && (
          <Link
            href={askAboutConceptHref(selectedConcept.label)}
            className="text-[12.5px] font-medium text-[var(--kp-accent)] underline underline-offset-4 hover:opacity-80"
          >
            Ask about this concept
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-[15px] text-[var(--kp-ink-faint)]">
          {query.trim() ? (
            <>Nothing matches “{query}”.</>
          ) : selectedConcept ? (
            // The concept exists and is real; nothing under it matches
            // the OTHER filters. Saying "nothing matches" without
            // naming which filter did it leaves someone stuck.
            <>Nothing here is both {selectedConcept.label} and {KIND_LABEL[filter as KnowledgeObjectKind] ?? filter}.</>
          ) : (
            <>Nothing to show with these filters.</>
          )}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--kp-rule)] border-t border-[var(--kp-rule)]">
          {visible.map((object) => (
            <li key={object.id} className="group py-5">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start md:gap-10">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(object.id)}
                    className="text-left"
                  >
                    <h3 className="text-[clamp(1rem,1.6vw,1.15rem)] font-medium leading-snug transition-colors duration-[var(--kp-fast)] group-hover:text-[var(--kp-accent)]">
                      {object.title}
                    </h3>
                  </button>

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-[var(--kp-ink-faint)]">
                    <span>{object.source}</span>
                    <span aria-hidden>·</span>
                    <span>{KIND_LABEL[object.kind]}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={object.savedAt}>
                      {new Date(object.savedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                    </time>
                    {object.author && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{object.author}</span>
                      </>
                    )}
                    {object.revisits !== undefined && object.revisits > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>revisited {object.revisits}×</span>
                      </>
                    )}
                  </p>

                  {/* Rendered only when there IS one. Nothing derives a
                      line like this from a real item yet, so a live row
                      simply does not have it. */}
                  {object.insight && (
                    <p className="mt-2.5 max-w-[62ch] border-l-2 border-[var(--kp-accent-soft)] pl-3 text-[13.5px] italic leading-relaxed text-[var(--kp-ink-soft)]">
                      {object.insight}
                    </p>
                  )}

                  {object.conceptIds.length > 0 && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {object.conceptIds.map((id) => {
                        const label = conceptById.get(id)?.label
                        // INSIDE the Explorer a concept filters in
                        // place; it does not navigate to the Explorer
                        // we are already standing in. The Reader's
                        // chips are links for the same reason: each
                        // goes to wherever the concept is NOT.
                        //
                        // A chip whose concept is not in the rail —
                        // which happens when the rail is capped — has
                        // nothing to select, so it stays a label rather
                        // than becoming a control that does nothing.
                        const selectable = onSelectConcept && label !== undefined
                        return (
                          <li key={id}>
                            {selectable ? (
                              <button
                                type="button"
                                onClick={() => onSelectConcept(id === selectedConceptId ? null : id)}
                                aria-pressed={id === selectedConceptId}
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-[var(--kp-fast)]",
                                  id === selectedConceptId
                                    ? "border-[var(--kp-accent)] text-[var(--kp-accent)]"
                                    : "border-[var(--kp-rule)] text-[var(--kp-ink-faint)] hover:border-[var(--kp-ink)] hover:text-[var(--kp-ink)]",
                                )}
                              >
                                {label}
                              </button>
                            ) : (
                              <span className="rounded-full border border-[var(--kp-rule)] px-2 py-0.5 text-[11px] text-[var(--kp-ink-faint)]">
                                {label ?? id}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {/* CONTEXT, NOT CONTENT. The summary sits below the
                      concepts and is clamped to two lines: it answers
                      "is this the one I meant?" while scanning, and a
                      row that unfolded into three paragraphs would stop
                      the list being scannable, which is the only reason
                      this section is a list.
                      Clamped in CSS — the stored text is never altered,
                      and the full summary is in the Reader.
                      Absent means no summary exists yet. Nothing is
                      substituted for it: a publisher's meta description
                      is the source's marketing copy, not something
                      Keeply understood. */}
                  {object.summary && (
                    <p className="mt-2.5 line-clamp-2 max-w-[68ch] text-pretty text-[13px] leading-relaxed text-[var(--kp-ink-soft)]">
                      {object.summary}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 md:flex-col md:items-end md:gap-1.5 md:opacity-0 md:transition-opacity md:duration-[var(--kp-fast)] md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  {object.url ? (
                    // A real save opens in the reader. The drawer stays
                    // reachable by clicking the title — it is a preview,
                    // not the destination.
                    <Link
                      href={`/knowledge/read/${object.id}`}
                      className="text-[12.5px] font-medium text-[var(--kp-ink-soft)] hover:text-[var(--kp-accent)]"
                    >
                      Read
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpen(object.id)}
                      className="text-[12.5px] font-medium text-[var(--kp-ink-soft)] hover:text-[var(--kp-accent)]"
                    >
                      Open
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAsk(`What did I learn from “${object.title}”?`)}
                    className="text-[12.5px] font-medium text-[var(--kp-ink-soft)] hover:text-[var(--kp-accent)]"
                  >
                    Ask about this
                  </button>
                  <button
                    type="button"
                    onClick={onExploreConnections}
                    className="text-[12.5px] font-medium text-[var(--kp-ink-soft)] hover:text-[var(--kp-accent)]"
                  >
                    Connections
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

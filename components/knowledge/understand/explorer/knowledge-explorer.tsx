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

import { useMemo, useState } from "react"
import type { KnowledgeConcept, KnowledgeObject, KnowledgeObjectKind } from "@/lib/knowledge/understand/types"
import { cn } from "@/lib/utils"
import { Label } from "../shell/section"

type Filter = "all" | KnowledgeObjectKind
type Sort = "recent" | "relevant" | "revisited"

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "article", label: "Articles" },
  { id: "video", label: "Videos" },
  { id: "pdf", label: "PDFs" },
  { id: "note", label: "Notes" },
]

const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "relevant", label: "Relevant" },
  { id: "revisited", label: "Most revisited" },
]

const KIND_LABEL: Record<KnowledgeObjectKind, string> = {
  article: "Article",
  video: "Video",
  pdf: "PDF",
  note: "Note",
}

export function KnowledgeExplorer({
  objects,
  concepts,
  onOpen,
  onAsk,
  onExploreConnections,
}: {
  objects: KnowledgeObject[]
  concepts: KnowledgeConcept[]
  onOpen: (id: string) => void
  onAsk: (question: string) => void
  onExploreConnections: () => void
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("recent")
  const [query, setQuery] = useState("")

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = objects.filter((o) => {
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
      if (sort === "recent") return b.savedAt.localeCompare(a.savedAt)
      if (sort === "relevant") return b.relevance - a.relevance
      return b.revisits - a.revisits
    })
  }, [objects, filter, sort, query, conceptById])

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
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="cursor-pointer border-b border-[var(--kp-rule)] bg-transparent py-1.5 text-[13px] text-[var(--kp-ink-soft)] focus:border-[var(--kp-accent)] focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12.5px] text-[var(--kp-ink-faint)]" aria-live="polite">
        {visible.length} of {objects.length} shown
      </p>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-[15px] text-[var(--kp-ink-faint)]">
          Nothing matches “{query}”.
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
                      {new Date(object.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                    {object.revisits > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>revisited {object.revisits}×</span>
                      </>
                    )}
                  </p>

                  <p className="mt-2.5 max-w-[62ch] border-l-2 border-[var(--kp-accent-soft)] pl-3 text-[13.5px] italic leading-relaxed text-[var(--kp-ink-soft)]">
                    {object.insight}
                  </p>

                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {object.conceptIds.map((id) => (
                      <li
                        key={id}
                        className="rounded-full border border-[var(--kp-rule)] px-2 py-0.5 text-[11px] text-[var(--kp-ink-faint)]"
                      >
                        {conceptById.get(id)?.label ?? id}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 md:flex-col md:items-end md:gap-1.5 md:opacity-0 md:transition-opacity md:duration-[var(--kp-fast)] md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onOpen(object.id)}
                    className="text-[12.5px] font-medium text-[var(--kp-ink-soft)] hover:text-[var(--kp-accent)]"
                  >
                    Open
                  </button>
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

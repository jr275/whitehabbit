"use client"

import {
  AlertCircle,
  Archive,
  Check,
  ExternalLink,
  Heart,
  MoreHorizontal,
  Play,
  RotateCw,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { KIND_META, durationLabel, savedAgo } from "@/lib/knowledge/config"
import type { KnowledgeItem, KnowledgeState, ViewMode } from "@/lib/knowledge/types"

/** The real, backend-driven pipeline steps — no fabricated AI stages. */
const PIPELINE: { key: KnowledgeState; label: string }[] = [
  { key: "fetching", label: "Fetching content" },
  { key: "extracting", label: "Extracting" },
]

function isProcessing(state: KnowledgeState): boolean {
  return state === "saved" || state === "fetching" || state === "extracting"
}

interface KnowledgeCardProps {
  item: KnowledgeItem
  view?: ViewMode
  index?: number
  selected?: boolean
  onToggleFavorite?: (item: KnowledgeItem) => void
  onArchive?: (item: KnowledgeItem) => void
  onRetry?: (item: KnowledgeItem) => void
  onDelete?: (item: KnowledgeItem) => void
  onSelect?: (item: KnowledgeItem) => void
}

export function KnowledgeCard({
  item,
  view = "masonry",
  index = 0,
  selected = false,
  onToggleFavorite,
  onArchive,
  onRetry,
  onDelete,
  onSelect,
}: KnowledgeCardProps) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const KindIcon = KIND_META[item.kind].icon
  const listenable = item.kind === "podcast" || item.kind === "video"
  const duration = durationLabel(item.kind, item.durationMin)
  const isList = view === "list"
  const processing = isProcessing(item.state)
  const ready = item.state === "ready"
  const showCover = ready && item.cover && !coverFailed
  const readerHref = `/knowledge/read/${item.id}`

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={cn(
        "kn-rise group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300",
        "border-[var(--kn-edge)] hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-28px_oklch(0.3_0.06_40/0.4)]",
        selected && "border-primary/60 ring-1 ring-primary/40",
        isList ? "flex items-stretch" : "flex flex-col",
      )}
    >
      {/* selection tick */}
      {onSelect && (
        <button
          type="button"
          onClick={() => onSelect(item)}
          aria-label={selected ? "Deselect item" : "Select item"}
          aria-pressed={selected}
          className={cn(
            "absolute left-3 top-3 z-20 flex size-6 items-center justify-center rounded-md border backdrop-blur transition-all",
            selected
              ? "border-primary bg-primary text-primary-foreground opacity-100"
              : "border-white/25 bg-black/40 text-white/80 opacity-0 group-hover:opacity-100",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
      )}

      {/* ── Cover (ready items with a real og:image only) ─── */}
      {showCover && (
        <Link
          href={readerHref}
          className={cn(
            "relative block shrink-0 overflow-hidden bg-secondary",
            isList ? "w-40 sm:w-52" : "aspect-[16/10] w-full",
          )}
        >
          {/* Arbitrary remote host → plain img (not next/image), lazy,
              hides itself on error so a dead image never breaks layout. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.cover as string}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          {listenable && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
                <Play className="size-5 translate-x-px fill-current" />
              </span>
            </div>
          )}
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/95 backdrop-blur">
            <KindIcon className="size-3" />
            {KIND_META[item.kind].label}
          </span>
          {item.readState === "unread" && (
            <span className="absolute right-3 top-3 size-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(0,0,0,0.35)]" />
          )}
        </Link>
      )}

      {/* ── Body ──────────────────────────────────────────── */}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-3 p-4", isList && "justify-center")}>
        {/* source */}
        <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          {!showCover && <KindIcon className="size-3.5 text-primary/80" />}
          <span className="truncate">{item.source}</span>
          {item.author && <span className="truncate font-normal text-muted-foreground/70">· {item.author}</span>}
        </div>

        {/* title — links to the reader once ready */}
        {ready ? (
          <Link href={readerHref} className="group/title">
            <h3
              className={cn(
                "text-balance font-serif font-medium leading-[1.15] tracking-tight text-foreground transition-colors group-hover/title:text-primary",
                isList ? "text-lg" : "text-[1.35rem]",
              )}
            >
              {item.title}
            </h3>
          </Link>
        ) : (
          <h3
            className={cn(
              "text-balance font-serif font-medium leading-[1.15] tracking-tight text-foreground",
              isList ? "text-lg" : "text-[1.35rem]",
            )}
          >
            {item.title}
          </h3>
        )}

        {/* state-dependent middle */}
        {processing && <ProcessingBlock state={item.state} />}

        {item.state === "failed" && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5">
            <span className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span className="text-pretty">{item.error || "Couldn't fetch this link."}</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onRetry?.(item)}
                className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              >
                <RotateCw className="size-3" /> Retry
              </button>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" /> Open original
              </a>
            </div>
          </div>
        )}

        {ready && (
          <>
            {item.aiSummary ? (
              <div className="rounded-lg border border-[var(--kn-ai)]/20 bg-[var(--kn-ai)]/[0.06] p-3">
                <p className="text-pretty text-[0.8rem] leading-relaxed text-foreground/80">{item.aiSummary}</p>
              </div>
            ) : (
              item.excerpt && (
                <p className="text-pretty text-[0.8rem] leading-relaxed text-muted-foreground">{item.excerpt}</p>
              )
            )}

            {item.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.topics.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] text-secondary-foreground/80"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {/* footer */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="truncate text-[11px] text-muted-foreground">
            {[duration, savedAgo(item.savedAt)].filter(Boolean).join(" · ")}
          </span>
          <div className="relative flex items-center gap-0.5 text-muted-foreground">
            <button
              onClick={() => onToggleFavorite?.(item)}
              aria-label={item.favorite ? "Remove favorite" : "Add favorite"}
              aria-pressed={item.favorite}
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Heart className={cn("size-3.5", item.favorite && "fill-[var(--kn-ai)] text-[var(--kn-ai)]")} />
            </button>
            <button
              onClick={() => onArchive?.(item)}
              aria-label="Archive"
              className="hidden size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground sm:flex"
            >
              <Archive className="size-3.5" />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-expanded={menuOpen}
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {menuOpen && (
              <div
                className="absolute bottom-9 right-0 z-30 w-40 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-secondary"
                >
                  <ExternalLink className="size-3.5" /> Open original
                </a>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete?.(item)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

/** Honest phase indicator — discrete real steps, never a fake percentage. */
function ProcessingBlock({ state }: { state: KnowledgeState }) {
  const activeIndex = PIPELINE.findIndex((p) => p.key === state) // -1 while "saved"
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="kn-shimmer h-full w-full" />
      </div>
      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center gap-2 text-[0.7rem] text-grow">
          <Check className="size-3" strokeWidth={3} /> Saved
        </li>
        {PIPELINE.map((p, i) => {
          const done = activeIndex > i
          const active = activeIndex === i
          return (
            <li
              key={p.key}
              className={cn(
                "flex items-center gap-2 text-[0.7rem]",
                done && "text-muted-foreground",
                active && "text-foreground",
                !done && !active && "text-muted-foreground/45",
              )}
            >
              {done ? (
                <Check className="size-3" strokeWidth={3} />
              ) : (
                <span
                  className={cn(
                    "size-2.5 rounded-full border",
                    active ? "animate-blink border-[var(--kn-ai)] bg-[var(--kn-ai)]/40" : "border-current",
                  )}
                />
              )}
              {p.label}
              {active && <span className="animate-blink">…</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

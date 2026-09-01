"use client"

import {
  AlertCircle,
  Archive,
  Check,
  Heart,
  MoreHorizontal,
  Play,
  RotateCw,
  Sparkles,
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { KIND_META, durationLabel, savedAgo } from "@/lib/knowledge/config"
import type { KnowledgeItem, ProcessingPhase, ViewMode } from "@/lib/knowledge/types"

const PHASES: { key: ProcessingPhase; label: string }[] = [
  { key: "fetching", label: "Fetching content" },
  { key: "understanding", label: "Understanding" },
  { key: "organizing", label: "Organizing" },
]

interface KnowledgeCardProps {
  item: KnowledgeItem
  view?: ViewMode
  index?: number
  selected?: boolean
  onToggleFavorite?: (id: string) => void
  onArchive?: (id: string) => void
  onSelect?: (id: string) => void
}

export function KnowledgeCard({
  item,
  view = "masonry",
  index = 0,
  selected = false,
  onToggleFavorite,
  onArchive,
  onSelect,
}: KnowledgeCardProps) {
  const KindIcon = KIND_META[item.kind].icon
  const listenable = item.kind === "podcast" || item.kind === "video"
  const duration = durationLabel(item.kind, item.durationMin)
  const isList = view === "list"

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={cn(
        "kn-rise group relative overflow-hidden rounded-2xl border bg-[var(--kn-paper)] transition-all duration-300",
        "border-[var(--kn-edge)] hover:border-foreground/20 hover:shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]",
        selected && "border-primary/60 ring-1 ring-primary/40",
        isList ? "flex items-stretch" : "flex flex-col",
      )}
    >
      {/* selection tick — appears on hover / when selected */}
      {onSelect && (
        <button
          type="button"
          onClick={() => onSelect(item.id)}
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

      {/* ── Cover ─────────────────────────────────────────── */}
      {item.cover && item.state !== "processing" && (
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-secondary",
            isList ? "w-40 sm:w-52" : "aspect-[16/10] w-full",
          )}
        >
          <Image
            src={item.cover || "/placeholder.svg"}
            alt=""
            fill
            sizes={isList ? "208px" : "(max-width: 640px) 100vw, 400px"}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

          {listenable && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
                <Play className="size-5 translate-x-px fill-current" />
              </span>
            </div>
          )}

          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/90 backdrop-blur">
            <KindIcon className="size-3" />
            {KIND_META[item.kind].label}
          </span>
          {item.readState === "unread" && (
            <span className="absolute right-3 top-3 size-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(0,0,0,0.35)]" />
          )}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────── */}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-3 p-4", isList && "justify-center")}>
        {/* source */}
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {!item.cover && <KindIcon className="size-3.5 text-foreground/70" />}
          <span className="truncate">{item.source}</span>
          {item.author && <span className="truncate text-muted-foreground/60">· {item.author}</span>}
        </div>

        {/* title */}
        <h3
          className={cn(
            "text-balance font-serif font-medium leading-[1.15] tracking-tight text-foreground",
            isList ? "text-lg" : "text-[1.35rem]",
          )}
        >
          {item.title}
        </h3>

        {/* state-dependent middle */}
        {item.state === "processing" && <ProcessingBlock phase={item.phase} />}

        {item.state === "failed" && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2">
            <span className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="size-3.5" /> Couldn&apos;t fetch this link
            </span>
            <button className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline">
              <RotateCw className="size-3" /> Retry
            </button>
          </div>
        )}

        {item.state !== "processing" && item.state !== "failed" && (
          <>
            {item.aiSummary ? (
              <div className="rounded-lg border border-[var(--kn-ai)]/20 bg-[var(--kn-ai)]/[0.06] p-3">
                <span className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--kn-ai)]">
                  <Sparkles className="size-3" /> AI summary
                </span>
                <p className="text-pretty text-[0.8rem] leading-relaxed text-foreground/80">
                  {item.aiSummary}
                </p>
              </div>
            ) : (
              item.excerpt && (
                <p className="text-pretty text-[0.8rem] leading-relaxed text-muted-foreground">
                  {item.excerpt}
                </p>
              )
            )}

            {/* topics */}
            {item.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.topics.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
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
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {[duration, savedAgo(item.savedAt)].filter(Boolean).join(" · ")}
          </span>
          <div className="flex items-center gap-0.5 text-muted-foreground">
            {listenable && item.state === "ready" && (
              <button
                aria-label="Listen"
                className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium hover:bg-secondary hover:text-foreground"
              >
                <Play className="size-3 fill-current" /> Listen
              </button>
            )}
            <button
              onClick={() => onToggleFavorite?.(item.id)}
              aria-label={item.favorite ? "Remove favorite" : "Add favorite"}
              aria-pressed={item.favorite}
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Heart className={cn("size-3.5", item.favorite && "fill-[var(--kn-ai)] text-[var(--kn-ai)]")} />
            </button>
            <button
              onClick={() => onArchive?.(item.id)}
              aria-label="Archive"
              className="hidden size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground sm:flex"
            >
              <Archive className="size-3.5" />
            </button>
            <button
              aria-label="More actions"
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

/** Honest phase indicator — discrete steps, never a fake percentage. */
function ProcessingBlock({ phase = "fetching" }: { phase?: ProcessingPhase }) {
  const activeIndex = PHASES.findIndex((p) => p.key === phase)
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="kn-shimmer h-full w-full" />
      </div>
      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center gap-2 text-[0.7rem] text-grow">
          <Check className="size-3" strokeWidth={3} /> Saved
        </li>
        {PHASES.map((p, i) => {
          const done = i < activeIndex
          const active = i === activeIndex
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

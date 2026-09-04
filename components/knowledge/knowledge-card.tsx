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
  view = "grid",
  index = 0,
  selected = false,
  onToggleFavorite,
  onArchive,
  onRetry,
  onDelete,
  onSelect,
}: KnowledgeCardProps) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const KindIcon = KIND_META[item.kind].icon
  const listenable = item.kind === "podcast" || item.kind === "video"
  const duration = durationLabel(item.kind, item.durationMin)
  const isList = view === "list"
  const processing = isProcessing(item.state)
  const ready = item.state === "ready"
  const hasCover = ready && item.cover && !coverFailed
  const readerHref = `/knowledge/read/${item.id}`

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={cn(
        "kn-rise group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300",
        "border-[var(--kn-edge)] hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_20px_44px_-28px_oklch(0.3_0.06_40/0.45)]",
        selected && "border-primary/60 ring-1 ring-primary/40",
        isList ? "flex items-stretch" : "flex flex-col",
      )}
    >
      {/* Whole-card click target → the content itself is the interaction.
          Only for ready items (incl. guest items); processing/failed cards
          keep their inline controls instead. Lifted above the cover image and
          body panels (which are normal-flow siblings painting on top of a z-0
          overlay) but kept below the genuinely interactive controls, which sit
          at z-20. Text blocks are pointer-events-none so they never block it. */}
      {ready && (
        <Link href={readerHref} className="absolute inset-0 z-[5]" aria-label={`Open “${item.title}”`}>
          <span className="sr-only">Open “{item.title}”</span>
        </Link>
      )}

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

      {/* ── Visual (cover, or an honest typographic fallback) ─── */}
      {/* The 16:9 area is reserved from the moment the card mounts —
          during discovery it shows a discreet skeleton, so the real
          thumbnail (or the editorial fallback) fades into the SAME box
          with no layout shift. */}
      {(hasCover || ready || processing) && (
        <div
          className={cn(
            "relative shrink-0 overflow-hidden",
            isList ? "w-32 self-stretch sm:w-44" : "aspect-video w-full",
          )}
        >
          {hasCover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.cover as string}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={() => setCoverLoaded(true)}
                onError={() => setCoverFailed(true)}
                className={cn(
                  "h-full w-full object-cover transition-all duration-500 group-hover:scale-[1.03]",
                  coverLoaded ? "opacity-100" : "opacity-0",
                )}
              />
              {!coverLoaded && <CoverSkeleton kind={item.kind} isList={isList} muted />}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              {listenable && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
                    <Play className="size-5 translate-x-px fill-current" />
                  </span>
                </div>
              )}
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/95 backdrop-blur">
                <KindIcon className="size-3" />
                {KIND_META[item.kind].label}
              </span>
            </>
          ) : ready ? (
            /* No og:image — a calm paper panel with the kind glyph. Never a
               fabricated photo; it reads as an intentional "cover" state. */
            <FallbackCover kind={item.kind} isList={isList} />
          ) : (
            /* Still discovering the preview — a discreet reserved skeleton
               in the same box, so the eventual image/fallback never shifts
               layout. */
            <CoverSkeleton kind={item.kind} isList={isList} />
          )}
          {ready && item.readState === "unread" && (
            <span
              className={cn(
                "absolute size-2 rounded-full bg-primary",
                hasCover ? "right-3 top-3 shadow-[0_0_0_3px_rgba(0,0,0,0.35)]" : "right-3 top-3",
              )}
            />
          )}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────── */}
      {/* Body is intentionally NOT lifted above the overlay link — only the
          interactive controls inside it carry `relative z-10`, so clicking
          anywhere else on the card opens the reader. */}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2.5 p-4", isList && "justify-center")}>
        {/* source line — favicon + domain/source, falling back to the
            kind glyph when there's no favicon or it fails to load. */}
        <div className="pointer-events-none flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          {item.favicon && !faviconFailed ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.favicon || "/placeholder.svg"}
              alt=""
              width={14}
              height={14}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFaviconFailed(true)}
              className="size-3.5 shrink-0 rounded-[3px] object-contain"
            />
          ) : (
            <KindIcon className="size-3.5 shrink-0 text-primary/80" />
          )}
          <span className="truncate">{item.source}</span>
          {item.author && <span className="truncate font-normal text-muted-foreground/70">· {item.author}</span>}
        </div>

        {/* title */}
        <h3
          className={cn(
            "text-balance font-serif font-medium leading-[1.15] tracking-tight text-foreground",
            ready && "transition-colors group-hover:text-primary",
            isList ? "text-lg" : "text-[1.3rem]",
          )}
        >
          {item.title}
        </h3>

        {/* state-dependent middle */}
        {processing && <ProcessingBlock state={item.state} />}

        {item.state === "failed" && (
          <div className="relative z-10 flex flex-col gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5">
            <span className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span className="text-pretty">{item.error || "We couldn't open this link."}</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onRetry?.(item)}
                className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              >
                <RotateCw className="size-3" /> Try again
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

        {ready && !isList && (
          <>
            {item.aiSummary ? (
              <p className="pointer-events-none line-clamp-3 text-pretty text-[0.82rem] leading-relaxed text-foreground/75">
                {item.aiSummary}
              </p>
            ) : (
              item.excerpt && (
                <p className="pointer-events-none line-clamp-2 text-pretty text-[0.82rem] leading-relaxed text-muted-foreground">
                  {item.excerpt}
                </p>
              )
            )}

            {item.topics.length > 0 && (
              <div className="pointer-events-none flex flex-wrap gap-1.5">
                {item.topics.slice(0, 3).map((t) => (
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

        {/* List rows: surface the same summary/excerpt + topics the grid
            shows, so the list reads as an intentional, information-dense
            experience rather than a compressed grid. Topics stay hidden on
            the narrowest screens where the row has little room. */}
        {ready && isList && (
          <>
            {item.aiSummary ? (
              <p className="pointer-events-none line-clamp-2 text-pretty text-[0.82rem] leading-relaxed text-foreground/75">
                {item.aiSummary}
              </p>
            ) : (
              item.excerpt && (
                <p className="pointer-events-none line-clamp-2 text-pretty text-[0.82rem] leading-relaxed text-muted-foreground">
                  {item.excerpt}
                </p>
              )
            )}

            {item.topics.length > 0 && (
              <div className="pointer-events-none hidden flex-wrap gap-1.5 sm:flex">
                {item.topics.slice(0, 3).map((t) => (
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

        {/* footer — meta + actions */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <span className="pointer-events-none min-w-0 truncate text-[11px] text-muted-foreground">
            {[duration, savedAgo(item.savedAt)].filter(Boolean).join(" · ")}
          </span>
          <div className="relative z-10 flex items-center gap-0.5 text-muted-foreground">
            {/* favorite — subtle, always available */}
            <button
              onClick={() => onToggleFavorite?.(item)}
              aria-label={item.favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={item.favorite}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary hover:text-foreground",
                item.favorite && "text-[var(--kn-ai)]",
              )}
            >
              <Heart className={cn("size-3.5", item.favorite && "fill-[var(--kn-ai)]")} />
            </button>
            {/* archive + more — revealed on hover (desktop), always shown on touch */}
            <button
              onClick={() => onArchive?.(item)}
              aria-label="Archive"
              className="hidden size-7 items-center justify-center rounded-md opacity-0 transition-all hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
            >
              <Archive className="size-3.5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-all hover:bg-secondary hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                  menuOpen && "opacity-100",
                )}
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
      </div>
    </article>
  )
}

/** Honest imageless "cover": paper gradient + the kind glyph. Derived
 * entirely from the real item kind — never a fabricated photograph. */
function FallbackCover({ kind, isList }: { kind: KnowledgeItem["kind"]; isList: boolean }) {
  const KindIcon = KIND_META[kind].icon
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--kn-well)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(120% 120% at 15% 10%, color-mix(in oklch, var(--primary) 9%, transparent) 0%, transparent 55%)",
        }}
      />
      <KindIcon className={cn("text-primary/25", isList ? "size-7" : "size-10")} strokeWidth={1.25} />
      {!isList && (
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-[var(--kn-edge)] bg-card/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
          <KindIcon className="size-3" />
          {KIND_META[kind].label}
        </span>
      )}
    </div>
  )
}

/** Discreet reserved cover placeholder shown while a preview is being
 * discovered (or an image is still decoding). Same box as the real
 * cover, so nothing shifts when the image/fallback arrives. */
function CoverSkeleton({ kind, isList, muted }: { kind: KnowledgeItem["kind"]; isList: boolean; muted?: boolean }) {
  const KindIcon = KIND_META[kind].icon
  return (
    <div className={cn("absolute inset-0 flex items-center justify-center overflow-hidden bg-[var(--kn-well)]", muted && "opacity-100")}>
      <div className="kn-shimmer pointer-events-none absolute inset-0 opacity-60" />
      <KindIcon className={cn("relative text-primary/20", isList ? "size-6" : "size-9")} strokeWidth={1.25} />
    </div>
  )
}

/** Honest phase indicator — discrete real steps, never a fake percentage. */
function ProcessingBlock({ state }: { state: KnowledgeState }) {
  const activeIndex = PIPELINE.findIndex((p) => p.key === state) // -1 while "saved"
  return (
    <div className="relative z-10 rounded-lg border border-border bg-secondary/40 p-3">
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

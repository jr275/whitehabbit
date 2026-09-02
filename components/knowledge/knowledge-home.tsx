"use client"

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { openCommandPalette, openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeLibrary } from "@/lib/knowledge/use-knowledge"
import type { KnowledgeItem } from "@/lib/knowledge/types"
import { cn } from "@/lib/utils"
import { EmptyLibrary } from "./empty-state"
import { KnowledgeCard } from "./knowledge-card"

function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

/** Time-of-day depends on the *viewer's* local clock, which differs from
 * the server's. Computing it during render causes an SSR/client hydration
 * mismatch, so we render a stable neutral greeting on the server + first
 * paint, then swap to the localized one after mount. */
function useGreeting(): string {
  const [text, setText] = useState("Welcome back")
  useEffect(() => {
    setText(greeting())
  }, [])
  return text
}

function firstName(email?: string | null): string | null {
  if (!email) return null
  const handle = email.split("@")[0]?.replace(/[._-]+/g, " ").trim()
  if (!handle) return null
  return handle.charAt(0).toUpperCase() + handle.slice(1)
}

export function KnowledgeHome() {
  const { items, status, total, toggleFavorite, archive, remove, retry } = useKnowledgeLibrary({ filter: "all" })
  const { data: session } = useSession()
  const name = firstName(session?.user?.email)
  const hello = useGreeting()

  const ready = items.filter((i) => i.state === "ready")
  const unread = ready.filter((i) => i.readState === "unread").slice(0, 8)
  const favorites = ready.filter((i) => i.favorite).slice(0, 8)
  const recent = items.slice(0, 10)

  const actions = { onToggleFavorite: toggleFavorite, onArchive: archive, onDelete: remove, onRetry: retry }

  return (
    <div>
      {/* ── Hero + save bar (pure black, tight bold sans) ─────── */}
      <section className="border-b border-[var(--kn-edge)]">
        <div className="mx-auto max-w-[1500px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="text-sm font-semibold text-primary">
            {hello}
            {name ? `, ${name}` : ""}
          </p>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold leading-[1.03] tracking-[-0.02em] text-foreground sm:text-6xl">
            Everything worth remembering, in one calm place.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {status === "ready" && total > 0
              ? `You have ${total} ${total === 1 ? "piece" : "pieces"} in your library. Save something new, or pick up where you left off.`
              : "Save an article, a video or a paper — Keeply fetches it, understands it and keeps it beautifully readable for you."}
          </p>

          {/* prominent, effortless save */}
          <div className="mt-8 flex max-w-xl flex-col gap-2.5 sm:flex-row">
            <button
              onClick={openSaveDialog}
              className="group flex h-12 flex-1 items-center gap-3 rounded-full bg-primary px-5 text-left text-primary-foreground transition-transform hover:scale-[1.01] active:scale-[0.99]"
            >
              <Plus className="size-5" strokeWidth={2.5} />
              <span className="flex-1 text-[15px] font-medium">Save a link…</span>
              <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 font-mono text-[11px]">⌘S</span>
            </button>
            <button
              onClick={openCommandPalette}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-5 text-[15px] font-medium text-foreground transition-colors hover:border-foreground/30"
            >
              <Search className="size-4.5" /> Search
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-6 lg:px-8">
        {status === "loading" ? (
          <HomeSkeleton />
        ) : total === 0 ? (
          <EmptyLibrary onSave={openSaveDialog} />
        ) : (
          <div className="flex flex-col gap-16">
            {unread.length > 0 && (
              <CarouselSection
                title="Jump back in"
                subtitle="Unread saves waiting for you"
                href="/knowledge/library"
                items={unread}
                actions={actions}
              />
            )}

            <CarouselSection
              title="Recently saved"
              subtitle="The latest additions to your library"
              href="/knowledge/library"
              items={recent}
              actions={actions}
            />

            {favorites.length > 0 && (
              <CarouselSection
                title="Favorites"
                subtitle="The ones you starred"
                href="/knowledge/favorites"
                items={favorites}
                actions={actions}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type RowActions = {
  onToggleFavorite: (i: KnowledgeItem) => void
  onArchive: (i: KnowledgeItem) => void
  onDelete: (i: KnowledgeItem) => void
  onRetry: (i: KnowledgeItem) => void
}

/** A section title + a horizontally-scrolling carousel of cards with
 * circular ‹/› nav — the Apple-style motif. Nav buttons only appear
 * when the row actually overflows, and disable at each end. */
function CarouselSection({
  title,
  subtitle,
  href,
  items,
  actions,
}: {
  title: string
  subtitle: string
  href: string
  items: KnowledgeItem[]
  actions: RowActions
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    update()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      el.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [update, items.length])

  const scroll = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" })
  }

  const hasNav = canLeft || canRight

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-foreground sm:text-[1.75rem]">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={href}
            className="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
          >
            Browse all <ChevronRight className="size-4" />
          </Link>
          {hasNav && (
            <div className="hidden items-center gap-2 sm:flex">
              <CarouselButton dir="left" disabled={!canLeft} onClick={() => scroll(-1)} />
              <CarouselButton dir="right" disabled={!canRight} onClick={() => scroll(1)} />
            </div>
          )}
        </div>
      </div>

      <div ref={scrollerRef} className="kn-scroll-x -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {items.map((item, i) => (
          <div key={item.id} className="w-[290px] shrink-0 snap-start sm:w-[330px]">
            <KnowledgeCard
              item={item}
              view="grid"
              index={i}
              onToggleFavorite={actions.onToggleFavorite}
              onArchive={actions.onArchive}
              onDelete={actions.onDelete}
              onRetry={actions.onRetry}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function CarouselButton({ dir, disabled, onClick }: { dir: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      className={cn(
        "flex size-9 items-center justify-center rounded-full border border-[var(--kn-edge)] bg-card text-foreground transition-all",
        "hover:border-foreground/30 hover:bg-secondary",
        disabled && "cursor-default opacity-30 hover:border-[var(--kn-edge)] hover:bg-card",
      )}
    >
      <Icon className="size-4.5" />
    </button>
  )
}

function HomeSkeleton() {
  return (
    <div className="flex gap-5 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-[290px] shrink-0 overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-card sm:w-[330px]"
          style={{ height: 300 }}
        >
          <div className="kn-shimmer h-full w-full" />
        </div>
      ))}
    </div>
  )
}

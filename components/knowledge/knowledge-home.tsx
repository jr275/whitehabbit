"use client"

import { ArrowRight, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { openCommandPalette, openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeLibrary } from "@/lib/knowledge/use-knowledge"
import type { KnowledgeItem } from "@/lib/knowledge/types"
import { EmptyLibrary } from "./empty-state"
import { KnowledgeCard } from "./knowledge-card"

function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
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

  const ready = items.filter((i) => i.state === "ready")
  const unread = ready.filter((i) => i.readState === "unread").slice(0, 3)
  const favorites = ready.filter((i) => i.favorite).slice(0, 3)
  const recent = items.slice(0, 6)

  const actions = { onToggleFavorite: toggleFavorite, onArchive: archive, onDelete: remove, onRetry: retry }

  return (
    <div>
      {/* ── Editorial hero + save bar ─────────────────────── */}
      <section className="border-b border-[var(--kn-edge)]">
        <div className="mx-auto max-w-[1500px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <p className="text-sm font-medium text-primary">
            {greeting()}
            {name ? `, ${name}` : ""}
          </p>
          <h1 className="mt-3 max-w-2xl text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            Everything worth remembering, in one calm place.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
            {status === "ready" && total > 0
              ? `You have ${total} ${total === 1 ? "piece" : "pieces"} in your library. Save something new, or pick up where you left off.`
              : "Save an article, a video or a paper — we'll fetch it, understand it and keep it beautifully readable for you."}
          </p>

          {/* prominent, effortless save */}
          <div className="mt-7 flex max-w-xl flex-col gap-2.5 sm:flex-row">
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
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-5 text-[15px] font-medium text-foreground transition-colors hover:border-foreground/25"
            >
              <Search className="size-4.5" /> Search
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
        {status === "loading" ? (
          <HomeSkeleton />
        ) : total === 0 ? (
          <EmptyLibrary onSave={openSaveDialog} />
        ) : (
          <div className="flex flex-col gap-14">
            {unread.length > 0 && (
              <Section title="Jump back in" subtitle="Unread saves waiting for you" href="/knowledge/library">
                <Row items={unread} {...actions} />
              </Section>
            )}

            <Section title="Recently saved" subtitle="The latest additions to your library" href="/knowledge/library">
              <Row items={recent} {...actions} />
            </Section>

            {favorites.length > 0 && (
              <Section title="Favorites" subtitle="The ones you starred" href="/knowledge/favorites">
                <Row items={favorites} {...actions} />
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  subtitle,
  href,
  children,
}: {
  title: string
  subtitle: string
  href: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-70"
        >
          View all <ArrowRight className="size-4" />
        </Link>
      </div>
      {children}
    </section>
  )
}

function Row({
  items,
  onToggleFavorite,
  onArchive,
  onDelete,
  onRetry,
}: {
  items: KnowledgeItem[]
  onToggleFavorite: (i: KnowledgeItem) => void
  onArchive: (i: KnowledgeItem) => void
  onDelete: (i: KnowledgeItem) => void
  onRetry: (i: KnowledgeItem) => void
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => (
        <KnowledgeCard
          key={item.id}
          item={item}
          view="grid"
          index={i}
          onToggleFavorite={onToggleFavorite}
          onArchive={onArchive}
          onDelete={onDelete}
          onRetry={onRetry}
        />
      ))}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-card"
          style={{ height: 300 }}
        >
          <div className="kn-shimmer h-full w-full" />
        </div>
      ))}
    </div>
  )
}

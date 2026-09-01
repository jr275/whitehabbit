"use client"

import { ArrowUpRight, GitCompareArrows, Sparkles, TrendingUp, Clock } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { Collection, Insight } from "@/lib/knowledge/types"

const INSIGHT_ICON = {
  connection: GitCompareArrows,
  trend: TrendingUp,
  revisit: Clock,
} as const

/** "Your recent interests" — a compact editorial understanding block. */
export function RecentInterests({ topics, count }: { topics: string[]; count: number }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-5">
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <Sparkles className="size-3.5 text-[var(--kn-ai)]" /> Your recent interests
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {topics.map((t) => (
          <span
            key={t}
            className="rounded-lg bg-secondary/60 px-2.5 py-1 font-serif text-base font-medium text-foreground"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {count} pieces you&apos;ve saved recently are related to{" "}
        <span className="text-foreground">AI agents</span>.
      </p>
      <button className="mt-3 flex items-center gap-1 text-sm font-medium text-[var(--kn-ai)] hover:underline">
        Explore topic <ArrowUpRight className="size-3.5" />
      </button>
    </section>
  )
}

/** "Today's Intelligence" — a short, restrained set of observations. */
export function DailyIntelligence({ insights }: { insights: Insight[] }) {
  return (
    <section aria-label="Today's Intelligence">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
          Today&apos;s Intelligence
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {insights.length} worth revisiting
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {insights.map((insight) => {
          const Icon = INSIGHT_ICON[insight.kind]
          return (
            <article
              key={insight.id}
              className="group flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-4 transition-colors hover:border-foreground/20"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--kn-ai)]/10 text-[var(--kn-ai)]">
                <Icon className="size-4" />
              </span>
              <p className="text-pretty text-sm leading-relaxed text-foreground/85">{insight.body}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const ACCENT: Record<Collection["accent"], string> = {
  blue: "text-primary",
  green: "text-grow",
  amber: "text-[var(--kn-ai)]",
  neutral: "text-muted-foreground",
}

/** AI-organized collections rail. */
export function CollectionsRail({ collections }: { collections: Collection[] }) {
  return (
    <section aria-label="Collections">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">Collections</h2>
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--kn-ai)]">
            <Sparkles className="size-3" /> Organized for you
          </span>
        </div>
        <Link
          href="/knowledge/collections"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => (
          <CollectionCard key={c.id} collection={c} />
        ))}
      </div>
    </section>
  )
}

export function CollectionCard({ collection: c }: { collection: Collection }) {
  return (
    <Link
      href="/knowledge/collections"
      className="group flex items-center gap-4 overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-3 transition-all hover:border-foreground/20 hover:shadow-[0_18px_50px_-28px_rgba(0,0,0,0.9)]"
    >
      {/* mosaic preview */}
      <div className="grid size-20 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl">
        {c.covers.slice(0, 4).map((cover, i) => (
          <div
            key={i}
            className={cn(
              "relative bg-secondary",
              c.covers.length === 1 && "col-span-2 row-span-2",
              c.covers.length === 2 && "row-span-2",
              c.covers.length === 3 && i === 0 && "row-span-2",
            )}
          >
            <Image src={cover || "/placeholder.svg"} alt="" fill sizes="80px" className="object-cover" />
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {c.auto && <Sparkles className={cn("size-3", ACCENT[c.accent])} />}
          <h3 className="truncate font-serif text-lg font-medium text-foreground">{c.name}</h3>
        </div>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {c.itemCount} pieces
        </p>
        {c.description && (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{c.description}</p>
        )}
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}

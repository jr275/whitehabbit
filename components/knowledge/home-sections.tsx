"use client"

/* ================================================================== *
 * HOME SECTIONS — the editorial building blocks that turn the Home
 * from a shelf of links into a view of the user's knowledge: real
 * aggregate signals, a live glimpse of the topics surfacing across the
 * library, and an honest, prepared Discover surface.
 *
 * Every number here is REAL — sourced from the library totals the app
 * already computes. Nothing is fabricated: where a service (idea
 * extraction, connections) isn't wired yet, the surface says so plainly
 * rather than inventing recommendations.
 * ================================================================== */

import Link from "next/link"
import { ArrowRight, Compass, Layers, Sparkles } from "lucide-react"

/* ── Your knowledge — real aggregate signals ────────────────────────
 * A restrained editorial masthead of the library's true state. The
 * three numbers are load-bearing (they answer "what's happening inside
 * my knowledge?"), never decorative. Values arrive as `null` while their
 * count is still being fetched and render as a quiet placeholder — never
 * a guessed number. */
export interface KnowledgeSignal {
  label: string
  value: number | null
  href: string
}

export function KnowledgeSignals({ signals }: { signals: KnowledgeSignal[] }) {
  return (
    <section aria-label="Your knowledge">
      <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
        Your knowledge
      </h2>
      <div className="grid grid-cols-3 divide-x divide-[var(--kn-edge)] overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)]">
        {signals.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group flex flex-col gap-1 px-4 py-5 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--kn-ai)] sm:px-6 sm:py-6"
          >
            <span className="font-serif text-3xl font-medium leading-none tracking-tight text-foreground tabular-nums sm:text-4xl">
              {s.value == null ? <span className="text-muted-foreground/30">—</span> : s.value.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground sm:text-[13px]">
              {s.label}
              <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ── Topics glimpse ─────────────────────────────────────────────────
 * A live look at the themes surfacing across the saved items currently
 * loaded — sized by real frequency so the strongest themes read louder.
 * It's an honest glimpse ("surfacing across your library"), with the
 * authoritative, complete view one tap away on the Topics page. Renders
 * nothing when no topics have emerged yet. */
export interface TopicGlimpse {
  label: string
  count: number
}

export function TopicsPreview({ topics }: { topics: TopicGlimpse[] }) {
  if (topics.length === 0) return null
  const max = topics.reduce((m, t) => Math.max(m, t.count), 1)

  return (
    <section aria-label="Topics">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-foreground sm:text-[1.75rem]">Topics</h2>
          <p className="mt-1 text-sm text-muted-foreground">Themes surfacing across your library</p>
        </div>
        <Link
          href="/knowledge/topics"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Browse all <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {topics.map((t) => {
          // Real frequency → a gentle three-step emphasis. Never invented.
          const strong = t.count >= Math.max(2, max * 0.66)
          const medium = !strong && t.count >= Math.max(2, max * 0.33)
          return (
            <Link
              key={t.label}
              href="/knowledge/topics"
              className={
                "rounded-full border border-[var(--kn-edge)] px-3.5 py-1.5 text-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                (strong
                  ? "bg-primary/10 font-medium text-primary"
                  : medium
                    ? "bg-secondary/70 text-foreground/85"
                    : "bg-card text-muted-foreground")
              }
            >
              {t.label}
              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground/70 tabular-nums">{t.count}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* ── Discover — prepared, honest ────────────────────────────────────
 * The Discover surface as a product concept: the place where Keeply will
 * surface connections between what you've saved. It exists now as an
 * honest, dashed placeholder — clearly "coming soon" — that describes the
 * three kinds of discovery to come WITHOUT fabricating a single
 * connection. When the connections engine lands, it plugs in here. */
const DISCOVER_FACETS = [
  {
    icon: Sparkles,
    title: "Connections",
    body: "Saves that turn out to be about the same thing, linked together.",
  },
  {
    icon: Layers,
    title: "Emerging topics",
    body: "The themes you're returning to, as they start to take shape.",
  },
  {
    icon: Compass,
    title: "Forgotten knowledge",
    body: "Something you saved a while ago that's relevant to you again.",
  },
] as const

export function DiscoverTeaser() {
  return (
    <section aria-label="Discover">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-foreground sm:text-[1.75rem]">Discover</h2>
        <p className="mt-1 text-sm text-muted-foreground">Connections across your knowledge — as it grows</p>
      </div>

      <div className="rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6 sm:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kn-ai)]/30 bg-[var(--kn-ai)]/10 px-3 py-1 text-[12px] font-medium text-[var(--kn-ai)]">
          Coming soon
        </span>
        <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
          Keeply is starting to build a memory of what you save. As your library grows, it will surface the ways your
          knowledge connects — here, honestly, only once there&apos;s something real to show.
        </p>

        <ul className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-3">
          {DISCOVER_FACETS.map((f) => {
            const Icon = f.icon
            return (
              <li key={f.title} className="flex flex-col gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--kn-ai)]/10 text-[var(--kn-ai)]">
                  <Icon className="size-4.5" />
                </span>
                <span className="text-[15px] font-medium text-foreground">{f.title}</span>
                <span className="text-pretty text-[13px] leading-relaxed text-muted-foreground">{f.body}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

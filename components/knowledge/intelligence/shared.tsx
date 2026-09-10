"use client"

import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Provenance } from "@/lib/knowledge/intelligence/types"

/** Honest label for where a surface's data came from. While the backend
 *  is not built, every intelligence surface renders this so preview data
 *  is never mistaken for real analysis of the user's library. */
export function ProvenanceBadge({ provenance }: { provenance: Provenance | null }) {
  if (provenance !== "preview") return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kn-edge)] bg-[var(--kn-well)]/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
      title="This surface shows preview data. It will reflect your real library once Knowledge Intelligence is connected."
    >
      <FlaskConical className="size-3" />
      Preview data
    </span>
  )
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** "today" / "2 days ago" / "3 weeks ago" from a day offset. */
export function dayLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "today"
  if (daysAgo === 1) return "yesterday"
  if (daysAgo < 14) return RELATIVE.format(-daysAgo, "day")
  return RELATIVE.format(-Math.round(daysAgo / 7), "week")
}

export type ChipTone = "default" | "accent" | "warn"

export function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: ChipTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium",
        tone === "accent" && "bg-[var(--kn-ai)]/12 text-[var(--kn-ai)]",
        tone === "warn" && "bg-amber-500/12 text-amber-500",
        tone === "default" && "bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

/** Section heading used across every panel. */
export function PanelHeading({
  title,
  hint,
  provenance,
}: {
  title: string
  hint?: string
  provenance?: Provenance | null
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {provenance !== undefined && <ProvenanceBadge provenance={provenance ?? null} />}
    </div>
  )
}

/** Shimmer skeleton grid while an envelope resolves. */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="kn-shimmer h-24 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)]" />
      ))}
    </div>
  )
}

export function PanelError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-10 text-center">
      <p className="text-sm text-foreground">Couldn&apos;t load this view.</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

/** Pill filter used by several panels to slice their data client-side. */
export function FilterChip({
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
        "rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]",
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/** A quiet confidence meter reused by questions and insights. */
export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-[var(--kn-ai)]/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
    </div>
  )
}

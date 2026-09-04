"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * The research thread — the visual spine that ties a query to its answer
 * and the evidence beneath it. It is deliberately NOT a flowchart or node
 * graph: just a quiet vertical rule with stage markers, so the reader feels
 * the relationship Question → Answer → Sources without any diagram.
 */
export function ResearchThread({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>
}

interface ResearchStageProps {
  /** Short uppercase stage label, e.g. "Question", "Answer", "Sources". */
  label: string
  /** Optional editorial subtitle shown next to the label. */
  subtitle?: string
  /** Emphasize the marker (used for the current focus — the answer). */
  emphasis?: boolean
  /** The last stage draws no connector below its marker. */
  last?: boolean
  children: ReactNode
}

export function ResearchStage({ label, subtitle, emphasis = false, last = false, children }: ResearchStageProps) {
  return (
    <section className="relative pb-10 pl-8 last:pb-0 sm:pl-10">
      {/* Connector — runs from just below this marker to the next stage's
          marker. Hidden on the final stage. */}
      {!last ? (
        <span aria-hidden className="absolute left-[5px] top-6 bottom-0 w-px bg-[var(--kn-edge)] sm:left-[6px]" />
      ) : null}

      {/* Stage marker */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-[5px] flex size-3 items-center justify-center rounded-full ring-4 ring-[var(--kn-bg,transparent)]",
          emphasis ? "bg-[var(--kn-ai)]" : "border border-[var(--kn-ai)]/50 bg-[var(--kn-paper)]",
        )}
      >
        {emphasis ? <span className="size-1 rounded-full bg-primary-foreground" /> : null}
      </span>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-foreground/80">{label}</h2>
        {subtitle ? <span className="text-[12.5px] text-muted-foreground">{subtitle}</span> : null}
      </div>

      {children}
    </section>
  )
}

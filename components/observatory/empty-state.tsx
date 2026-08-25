"use client"

import { ArrowRight, Radio } from "lucide-react"
import Link from "next/link"

/* Section 7: a workspace with zero real executions is a legitimate,
 * common state — never rendered as "0 Agents / 0 Executions / 0
 * Errors" (a row of real-looking zeros reads as a broken dashboard,
 * not an honest empty one). Links straight into the real Factory
 * flow ("/") that actually produces a first execution. */
export function ObservatoryEmptyState() {
  return (
    <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground">
        <Radio className="h-4 w-4" />
      </span>
      <p className="mt-4 text-[15px] font-medium text-foreground">No runtime activity yet.</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        Nothing has run in this workspace — real executions, events and outputs will appear here the moment a Worker actually runs.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
      >
        Run your first Worker
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

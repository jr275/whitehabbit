"use client"

/* ------------------------------------------------------------------ *
 * Heuristics — the worker's earned judgment. Each is a when/then rule
 * with a confidence and the number of runs that taught it, so it reads
 * as evidence-backed, not asserted. This is what separates a worker
 * that has done the work from a fresh prompt.
 * ------------------------------------------------------------------ */

import type { Heuristic } from "@/lib/workforce-demo/model"

export function Heuristics({ items }: { items: Heuristic[] }) {
  if (!items.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        No heuristics yet — this skill learns judgment as it runs.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((h) => {
        const pct = Math.round(h.confidence * 100)
        return (
          <li
            key={h.id}
            className="rounded-lg border border-border/60 bg-card/40 p-3"
          >
            <p className="text-[13px] leading-relaxed text-foreground">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                When{" "}
              </span>
              {h.when}
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-grow">
                {" "}
                then{" "}
              </span>
              {h.then}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-16 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-grow"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                  {pct}% conf
                </span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {h.evidenceRuns} runs · {h.learnedFrom}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

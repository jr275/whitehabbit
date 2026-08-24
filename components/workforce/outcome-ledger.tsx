"use client"

/* ------------------------------------------------------------------ *
 * OutcomeLedger — the workforce judged by results, not activity. Each
 * row is a dated business outcome attributed to a worker and the skill
 * that produced it, with the metric moved and (where known) dollar
 * impact. Newest first.
 * ------------------------------------------------------------------ */

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import Link from "next/link"
import type { DemoWorker, OutcomeTone, WorkOutcome } from "@/lib/workforce-demo/model"
import { formatUsd } from "@/lib/workforce-demo/selectors"

const TONE: Record<OutcomeTone, { color: string; Icon: typeof ArrowUpRight }> = {
  up: { color: "var(--color-grow)", Icon: ArrowUpRight },
  down: { color: "var(--color-grow)", Icon: ArrowDownRight },
  flat: { color: "var(--color-muted-foreground)", Icon: Minus },
}

export function OutcomeLedger({
  outcomes,
  workers,
}: {
  outcomes: WorkOutcome[]
  workers: DemoWorker[]
}) {
  const byId = new Map(workers.map((w) => [w.id, w]))

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
          Outcomes ledger
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {outcomes.length} results
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {outcomes.slice(0, 12).map((o) => {
          const w = byId.get(o.workerId)
          const tone = TONE[o.tone]
          return (
            <div
              key={o.id}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/30"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
                style={{ background: `${w?.accent}22`, color: w?.accent }}
              >
                {w?.initials ?? "—"}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-foreground">{o.summary}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {w ? (
                    <Link href={`/workforce/${w.id}`} className="hover:text-foreground">
                      {w.name}
                    </Link>
                  ) : (
                    "Worker"
                  )}{" "}
                  · {o.metric}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                {o.valueUsd ? (
                  <span className="hidden font-mono text-[12px] tabular-nums text-muted-foreground sm:inline">
                    {formatUsd(o.valueUsd)}
                  </span>
                ) : null}
                <span
                  className="flex items-center gap-1 font-mono text-[13px] font-semibold tabular-nums"
                  style={{ color: tone.color }}
                >
                  <tone.Icon className="h-3.5 w-3.5" />
                  {o.delta}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * OBSERVATORY — the living org. Not a dashboard of charts, but a map
 * of your workforce breathing in real time: the division lead at the
 * center, specialists radiating out, work pulsing along the reporting
 * lines. A live activity feed and an outcomes ledger surround it. All
 * values are derived from the demo Workforce store.
 * ------------------------------------------------------------------ */

import { useMemo, useState } from "react"
import { ActivityFeed } from "@/components/workforce/activity-feed"
import { WorkforceNav } from "@/components/workforce/nav"
import { OrgMap } from "@/components/workforce/org-map"
import { OutcomeLedger } from "@/components/workforce/outcome-ledger"
import { demoStore, useDemoWorkforce } from "@/lib/workforce-demo/store"
import { divisionMetrics, formatUsd } from "@/lib/workforce-demo/selectors"

const PULSE_TASK = "Weekly division sweep: find and act on the biggest lever."

export default function ObservatoryPage() {
  const { division, workers, skills, outcomes, activity, running, assembledFor } =
    useDemoWorkforce()
  const [pulsing, setPulsing] = useState(false)

  const lead = useMemo(() => workers.find((w) => w.role === "lead"), [workers])
  const specialists = useMemo(
    () => workers.filter((w) => w.role === "specialist"),
    [workers],
  )
  const metrics = useMemo(
    () => divisionMetrics(workers, skills, outcomes),
    [workers, skills, outcomes],
  )

  async function runPulse() {
    if (pulsing) return
    setPulsing(true)
    try {
      await demoStore.runDivisionPulse(PULSE_TASK)
    } finally {
      setPulsing(false)
    }
  }

  const stats = [
    { label: "Workers", value: String(metrics.workers) },
    { label: "Skills (IP)", value: String(metrics.skills) },
    { label: "Heuristics", value: String(metrics.heuristics) },
    { label: "Avg competence", value: `${metrics.avgCompetence}%` },
    { label: "Value driven", value: formatUsd(metrics.valueUsd) },
  ]

  return (
    <div className="min-h-dvh bg-background bg-substrate text-foreground">
      <WorkforceNav />

      <main className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8">
        {/* division header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                Division
              </span>
              {assembledFor && (
                <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  Assembled for your outcome
                </span>
              )}
            </div>
            <h1 className="mt-1 text-pretty text-2xl font-semibold tracking-tight">
              {division.name}
            </h1>
            <p className="mt-1 max-w-xl text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {assembledFor ? `"${assembledFor}"` : division.mandate}
            </p>
          </div>

          <button
            type="button"
            onClick={runPulse}
            disabled={pulsing}
            className="group flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary/16 disabled:opacity-60"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full bg-primary ${pulsing ? "animate-pulse" : ""}`}
            />
            {pulsing ? "Division working…" : "Run division pulse"}
          </button>
        </header>

        {/* metric strip */}
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="bg-card px-4 py-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* main grid: org map (hero) + right rail */}
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="relative overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
                Org map
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {running.length > 0 ? `${running.length} working` : "Steady"}
              </span>
            </div>
            <div className="aspect-[13/10] w-full">
              <OrgMap lead={lead} specialists={specialists} running={running} />
            </div>
          </section>

          <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <ActivityFeed activity={activity} workers={workers} />
          </aside>
        </div>

        {/* outcomes ledger */}
        <section className="mt-4 overflow-hidden rounded-xl border border-border/60 bg-card/40">
          <OutcomeLedger outcomes={outcomes} workers={workers} />
        </section>
      </main>
    </div>
  )
}

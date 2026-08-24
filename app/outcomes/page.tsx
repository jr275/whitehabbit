"use client"

/* ------------------------------------------------------------------ *
 * /outcomes — the division judged by business results, not activity.
 *
 * Every row is a dated, attributed WorkOutcome produced by a real run.
 * Rollups (total value, by worker, by metric) are computed from that
 * ledger — nothing is hardcoded. Filter by worker to trace credit.
 * ------------------------------------------------------------------ */

import { useMemo, useState } from "react"
import Link from "next/link"
import { WorkforceNav } from "@/components/workforce/nav"
import { useDemoWorkforce } from "@/lib/workforce-demo/store"
import { formatUsd } from "@/lib/workforce-demo/selectors"

export default function OutcomesPage() {
  const { workers, outcomes } = useDemoWorkforce()
  const [workerFilter, setWorkerFilter] = useState<string | null>(null)

  const filtered = useMemo(
    () => (workerFilter ? outcomes.filter((o) => o.workerId === workerFilter) : outcomes),
    [outcomes, workerFilter],
  )

  const totalValue = filtered.reduce((n, o) => n + (o.valueUsd ?? 0), 0)

  /** value contribution per worker (for the leaderboard) */
  const byWorker = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of outcomes) map.set(o.workerId, (map.get(o.workerId) ?? 0) + (o.valueUsd ?? 0))
    return [...map.entries()]
      .map(([id, value]) => ({ worker: workers.find((w) => w.id === id), value }))
      .filter((r) => r.worker)
      .sort((a, b) => b.value - a.value)
  }, [outcomes, workers])

  const topValue = byWorker[0]?.value ?? 1

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Business results</p>
          <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-foreground">Outcomes ledger</h1>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
            The workforce is measured by outcomes it moves, not tasks it runs. Each entry is attributed to the worker
            and skill that produced it.
          </p>
        </header>

        {/* rollup stat strip */}
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total value" value={formatUsd(totalValue)} accent />
          <Stat label="Outcomes" value={String(filtered.length)} />
          <Stat label="Contributors" value={String(byWorker.length)} />
          <Stat
            label="Avg / outcome"
            value={filtered.length ? formatUsd(Math.round(totalValue / filtered.length)) : "$0"}
          />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* ledger */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {workerFilter ? `${workers.find((w) => w.id === workerFilter)?.name}'s outcomes` : "All outcomes"}
              </h2>
              {workerFilter && (
                <button
                  onClick={() => setWorkerFilter(null)}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>

            <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/50">
              {filtered.length === 0 && (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">No outcomes yet.</p>
              )}
              {filtered.map((o) => {
                const worker = workers.find((w) => w.id === o.workerId)
                return (
                  <div key={o.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{o.metric}</span>
                        <span
                          className={`font-mono text-[12px] font-semibold ${
                            o.tone === "up" ? "text-grow" : o.tone === "down" ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {o.delta}
                        </span>
                      </div>
                      <p className="mt-1 text-pretty text-[13px] leading-relaxed text-muted-foreground">{o.summary}</p>
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                        <Link href={`/workforce/${o.workerId}`} className="text-muted-foreground hover:text-primary">
                          {worker?.name ?? "Worker"}
                        </Link>{" "}
                        · {o.at}
                      </p>
                    </div>
                    {o.valueUsd != null && (
                      <span className="shrink-0 rounded-md bg-grow/10 px-2 py-1 font-mono text-[11px] font-semibold text-grow">
                        {formatUsd(o.valueUsd)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* value leaderboard */}
          <aside>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Value by worker
            </h2>
            <div className="space-y-1.5 rounded-xl border border-border/60 bg-card/50 p-3">
              {byWorker.map(({ worker, value }) => {
                const active = workerFilter === worker!.id
                return (
                  <button
                    key={worker!.id}
                    onClick={() => setWorkerFilter(active ? null : worker!.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active ? "bg-primary/12" : "hover:bg-accent/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-foreground">{worker!.name}</span>
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-foreground">
                        {formatUsd(value)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(4, (value / topValue) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                      {worker!.title}
                    </p>
                  </button>
                )
              })}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${accent ? "text-grow" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  )
}

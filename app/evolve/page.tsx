"use client"

/* ------------------------------------------------------------------ *
 * /evolve — how the division gets better at its own job.
 *
 * Recommendations are DERIVED from live data (see lib/workforce-demo/
 * evolve.ts): skills near a maturity threshold, heuristics proven
 * enough to standardize, mastered IP a peer is missing. Applying one
 * mutates the division for real — promotions raise maturity, transfers
 * copy the recipe to another worker with lineage. Persisted.
 * ------------------------------------------------------------------ */

import { useMemo } from "react"
import Link from "next/link"
import { WorkforceNav } from "@/components/workforce/nav"
import { demoStore, useDemoWorkforce } from "@/lib/workforce-demo/store"
import { evolveRecommendations } from "@/lib/workforce-demo/evolve"
import type { EvolveKind } from "@/lib/workforce-demo/model"

const KIND_META: Record<EvolveKind, { label: string; tone: string }> = {
  promote_skill: { label: "Skill promotion", tone: "text-grow border-grow/40 bg-grow/10" },
  promote_heuristic: { label: "Heuristic → SOP", tone: "text-primary border-primary/40 bg-primary/10" },
  transfer_skill: { label: "IP transfer", tone: "text-warn border-warn/40 bg-warn/10" },
}

export default function EvolvePage() {
  const { workers, skills } = useDemoWorkforce()
  const recs = useMemo(() => evolveRecommendations(workers, skills), [workers, skills])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Compounding know-how</p>
            <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-foreground">Evolve</h1>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
              The division reads its own performance and proposes how to get better — promoting proven skills,
              standardizing trusted judgment, and moving mastered IP to workers who lack it. Apply one and the org
              changes for real.
            </p>
          </div>
          <button
            onClick={() => demoStore.reset()}
            className="rounded-lg border border-border px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            Reset division
          </button>
        </header>

        <section className="mt-8">
          {recs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No recommendations right now — every proven skill is promoted and its IP shared. Run more work in the
                <Link href="/observatory" className="text-primary hover:underline">
                  {" "}
                  Observatory
                </Link>{" "}
                to generate new signal.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {recs.map((rec) => {
                const meta = KIND_META[rec.kind]
                const worker = workers.find((w) => w.id === rec.workerId)
                const toWorker = rec.toWorkerId ? workers.find((w) => w.id === rec.toWorkerId) : null
                return (
                  <article
                    key={rec.id}
                    className="flex flex-col rounded-xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-border"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${meta.tone}`}>
                        {meta.label}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {Math.round(rec.confidence * 100)}% confidence
                      </span>
                    </div>

                    <h3 className="mt-3 text-pretty text-base font-semibold leading-snug text-foreground">{rec.title}</h3>
                    <p className="mt-2 flex-1 text-pretty text-[13px] leading-relaxed text-muted-foreground">
                      {rec.rationale}
                    </p>

                    <div className="mt-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Projected effect</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">{rec.projectedEffect}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <Link href={`/workforce/${rec.workerId}`} className="hover:text-primary">
                          {worker?.name}
                        </Link>
                        {toWorker && (
                          <>
                            {" → "}
                            <Link href={`/workforce/${toWorker.id}`} className="hover:text-primary">
                              {toWorker.name}
                            </Link>
                          </>
                        )}
                      </p>
                      <button
                        onClick={() => demoStore.applyEvolve(rec)}
                        className="shrink-0 rounded-lg bg-primary px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Apply
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

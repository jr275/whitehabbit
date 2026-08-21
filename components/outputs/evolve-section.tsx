"use client"

/* ------------------------------------------------------------------ *
 * Evolve — capabilities (what a worker CAN do) vs. outputs (what it
 * DID) stay strictly separate here. The recommendation below is
 * computed live from real output history, never a hand-typed insight.
 * ------------------------------------------------------------------ */

import { Check, Dna } from "lucide-react"
import { useState } from "react"
import { capabilityScores, recommendEvolution } from "@/lib/workforce/evolution"
import type { Worker, WorkerOutput } from "@/lib/workforce/model"

export function EvolveSection({ workers, outputs }: { workers: Worker[]; outputs: WorkerOutput[] }) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Evolve</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {workers.map((w) => (
          <WorkerEvolveCard key={w.id} worker={w} outputs={outputs} />
        ))}
      </div>
    </section>
  )
}

function WorkerEvolveCard({ worker, outputs }: { worker: Worker; outputs: WorkerOutput[] }) {
  const capabilities = capabilityScores(worker, outputs)
  const evolution = recommendEvolution(worker, outputs)
  const [trained, setTrained] = useState(false)

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: worker.identity.accent }}>
          {worker.identity.initials}
        </span>
        <span className="text-[13px] font-semibold text-foreground">{worker.identity.name}</span>
      </div>

      {/* capabilities — what it CAN do */}
      <div className="mt-3">
        <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Capabilities</p>
        <div className="flex flex-col gap-1.5">
          {capabilities.map((c) => (
            <div key={c.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11.5px] text-muted-foreground">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, c.score)}%` }} />
              </div>
              <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">{c.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* evolution opportunity — from output performance */}
      {evolution ? (
        <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.04] p-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-primary">Evolution opportunity</p>
          <p className="mt-1.5 text-[13px] font-medium text-foreground">{evolution.label}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {evolution.completed} {evolution.label.toLowerCase()} tasks completed
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px]">
            <span className="text-muted-foreground">
              Average quality <span className="font-mono text-foreground">{evolution.avgQuality}%</span>
            </span>
            <span className="text-muted-foreground">
              Failure rate <span className="font-mono text-foreground">{evolution.failureRate}%</span>
            </span>
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Most common issue: <span className="text-foreground">{evolution.issue}</span>
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Recommended training: <span className="text-foreground">{evolution.training}</span>
          </p>
          <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">
            Expected quality: {evolution.avgQuality}% → <span className="text-grow">{evolution.expectedQuality}%</span>
          </p>
          <button
            onClick={() => setTrained(true)}
            disabled={trained}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {trained ? (
              <>
                <Check className="h-3.5 w-3.5" /> Training scheduled
              </>
            ) : (
              <>
                <Dna className="h-3.5 w-3.5" /> Train Worker
              </>
            )}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-[11.5px] text-muted-foreground">No evolution opportunities right now — every capability is performing well.</p>
      )}
    </article>
  )
}

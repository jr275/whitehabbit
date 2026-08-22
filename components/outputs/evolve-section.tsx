"use client"

/* ------------------------------------------------------------------ *
 * Evolve — capabilities (what a worker CAN do) vs. outputs (what it
 * DID) stay strictly separate. Both read the real `metrics` table; a
 * category with no real executions yet reports as unmeasured, never
 * as an invented number or a silent zero.
 * ------------------------------------------------------------------ */

import { Check } from "lucide-react"
import { capabilityScores, recommendEvolution, skillExecutionStats } from "@/lib/workforce/evolution"
import type { MetricRecord, Worker, WorkerTask } from "@/lib/workforce/model"

export function EvolveSection({ workers, metrics, tasks }: { workers: Worker[]; metrics: MetricRecord[]; tasks: WorkerTask[] }) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Evolve</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {workers.map((w) => (
          <WorkerEvolveCard key={w.id} worker={w} metrics={metrics} tasks={tasks} />
        ))}
      </div>
    </section>
  )
}

function WorkerEvolveCard({ worker, metrics, tasks }: { worker: Worker; metrics: MetricRecord[]; tasks: WorkerTask[] }) {
  const capabilities = capabilityScores(worker, metrics)
  const evolution = recommendEvolution(worker, metrics)
  const stats = skillExecutionStats(worker, tasks)

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: worker.identity.accent }}>
          {worker.identity.initials}
        </span>
        <span className="text-[13px] font-semibold text-foreground">{worker.identity.name}</span>
      </div>

      {/* capabilities — what it CAN do, only shown when real data exists */}
      <div className="mt-3">
        <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Capabilities</p>
        {capabilities.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">No enabled skills yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {capabilities.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[11.5px] text-muted-foreground">{c.label}</span>
                {c.score == null ? (
                  <span className="flex-1 text-[10.5px] italic text-muted-foreground/70">Not yet measured — run this worker</span>
                ) : (
                  <>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, c.score)}%` }} />
                    </div>
                    <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">{c.score}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* observed success rate — real WorkerTask counts, per skill */}
      {stats.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Observed success rate</p>
          <div className="flex flex-col gap-1">
            {stats.map((s) => (
              <div key={s.skillId} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{s.skillName}</span>
                <span className="font-mono text-foreground">
                  {s.successRate == null ? "—" : `${s.successRate}%`}
                  <span className="ml-1 text-muted-foreground">
                    ({s.completed}/{s.completed + s.failed + s.blocked} finished{s.pendingApproval ? `, ${s.pendingApproval} pending approval` : ""})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* evolution opportunity — from real, sufficient output history only.
       * This is a read-only recommendation: there is no fine-tuning or
       * training pipeline behind it, so it never offers a "Train Worker"
       * action that would just be a fake confirmation with nothing real
       * behind it. */}
      {evolution ? (
        <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.04] p-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-primary">Evolution opportunity</p>
          <p className="mt-1.5 text-[13px] font-medium text-foreground">{evolution.label}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{evolution.sampleSize} real executions measured</p>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Average quality <span className="font-mono text-foreground">{evolution.avgQuality}%</span>
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Suggested focus: <span className="text-foreground">{evolution.training}</span>
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[11.5px] text-muted-foreground">
          {capabilities.some((c) => c.score != null) ? "Every measured capability is performing well." : "Run this worker a few times to unlock evolution recommendations."}
        </p>
      )}
    </article>
  )
}

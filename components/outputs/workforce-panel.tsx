"use client"

/* ------------------------------------------------------------------ *
 * WORKFORCE PANEL — section 10/12. Honest attribution and a Workforce
 * view foundation, scoped to what the architecture actually is today:
 * ONE Worker per Super Agent, running multiple Skills. A Skill is the
 * real unit of contribution here — not a fabricated separate "Worker"
 * this product hasn't built. Counts only, never a financial
 * attribution percentage nothing backs (section 10).
 * ------------------------------------------------------------------ */

import { getWorkerVisual } from "@/lib/workforce/visual-identity"
import type { Worker } from "@/lib/workforce/model"
import type { SkillContribution } from "@/lib/workforce/selectors"

export function WorkforcePanel({ worker, domainLabel, contributions }: { worker: Worker; domainLabel: string; contributions: SkillContribution[] }) {
  if (contributions.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">{domainLabel} Workforce</h2>
        <p className="text-[11px] text-muted-foreground">
          Running as 1 worker performing {contributions.length} role{contributions.length === 1 ? "" : "s"} — see note below
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contributions.map((c) => (
          <article key={c.skillId} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: getWorkerVisual(worker).accent }} />
              <h3 className="truncate text-[13px] font-semibold text-foreground">{c.skillName}</h3>
            </div>
            <div className="mt-2.5 flex items-center gap-4">
              <Stat label="Executions" value={c.executions} />
              <Stat label="Outputs" value={c.completedOutputs} />
            </div>
            {c.events.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-2.5">
                {c.events.map((e) => (
                  <li key={e.type} className="text-[12px] text-foreground">
                    {e.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-muted-foreground/70">No business event produced yet.</p>
            )}
          </article>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
        Today, one Worker performs all of a Super Agent&apos;s roles — these are that Worker&apos;s real, distinct Skills, not separate Workers. True multi-worker execution (a dedicated Worker
        per role) is not yet implemented.
      </p>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[9.5px] text-muted-foreground">{label}</div>
    </div>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WORKFORCE ROSTER — the division as a list of people, each with the
 * skills they own (their IP), competence, and live state. The entry
 * point into any worker's detail. Grouped by org role: the lead, then
 * the specialists reporting into it.
 * ------------------------------------------------------------------ */

import Link from "next/link"
import { useMemo } from "react"
import { WorkforceNav } from "@/components/workforce/nav"
import { WORKER_STATE_META, type DemoWorker } from "@/lib/workforce-demo/model"
import { useDemoWorkforce } from "@/lib/workforce-demo/store"
import { workerCompetence } from "@/lib/workforce-demo/selectors"

export default function WorkforcePage() {
  const { division, workers, skills } = useDemoWorkforce()

  const lead = useMemo(() => workers.find((w) => w.role === "lead"), [workers])
  const specialists = useMemo(
    () => workers.filter((w) => w.role === "specialist"),
    [workers],
  )

  return (
    <div className="min-h-dvh bg-background bg-substrate text-foreground">
      <WorkforceNav />
      <main className="mx-auto max-w-[1100px] px-5 py-6 sm:px-8">
        <header>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            {division.name}
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Workforce</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Every worker owns skills as proprietary IP — execution recipes plus
            the heuristics they learn from doing the work. Open one to see how
            it thinks.
          </p>
        </header>

        {lead && (
          <section className="mt-6">
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Division lead
            </h2>
            <RosterRow worker={lead} skills={skills} />
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Specialists · {specialists.length}
          </h2>
          <div className="grid gap-2">
            {specialists.map((w) => (
              <RosterRow key={w.id} worker={w} skills={skills} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function RosterRow({
  worker,
  skills,
}: {
  worker: DemoWorker
  skills: ReturnType<typeof useDemoWorkforce>["skills"]
}) {
  const competence = workerCompetence(worker, skills)
  const owned = skills.filter((s) => worker.skillIds.includes(s.id))
  const stateMeta = WORKER_STATE_META[worker.state]
  const toneColor =
    stateMeta.tone === "good"
      ? "var(--color-grow)"
      : stateMeta.tone === "info"
        ? "var(--color-primary)"
        : stateMeta.tone === "warn"
          ? "var(--color-warn)"
          : "var(--color-muted-foreground)"

  return (
    <Link
      href={`/workforce/${worker.id}`}
      className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-card/70"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold"
        style={{ background: `${worker.accent}22`, color: worker.accent }}
      >
        {worker.initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-foreground">
            {worker.name}
          </span>
          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: toneColor }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor }} />
            {stateMeta.label}
          </span>
        </div>
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {worker.title} · {worker.primaryKpi}
        </p>
      </div>

      <div className="hidden items-center gap-1.5 sm:flex">
        {owned.slice(0, 3).map((s) => (
          <span
            key={s.id}
            className="rounded-md border border-border/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            {s.name}
          </span>
        ))}
        {owned.length > 3 && (
          <span className="font-mono text-[9px] text-muted-foreground">+{owned.length - 3}</span>
        )}
      </div>

      <div className="w-16 shrink-0 text-right">
        <div className="text-[15px] font-semibold tabular-nums text-foreground">
          {competence}%
        </div>
        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
          Competence
        </div>
      </div>
    </Link>
  )
}

"use client"

/* ------------------------------------------------------------------ *
 * WORKER DETAIL — how one worker thinks and what it has done. The
 * header is its identity and mandate; below, its Skills-as-IP (each an
 * execution recipe + learned heuristics), a live run panel that drives
 * the demo execution provider, and its own outcomes + activity. This
 * is the surface where "an AI worker that owns proprietary skill"
 * becomes legible.
 * ------------------------------------------------------------------ */

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"
import { ActivityFeed } from "@/components/workforce/activity-feed"
import { WorkforceNav } from "@/components/workforce/nav"
import { OutcomeLedger } from "@/components/workforce/outcome-ledger"
import { SkillCard } from "@/components/workforce/skill-card"
import { WORKER_STATE_META } from "@/lib/workforce-demo/model"
import { demoStore, useDemoWorkforce } from "@/lib/workforce-demo/store"
import { workerCompetence } from "@/lib/workforce-demo/selectors"

export default function WorkerDetailPage() {
  const params = useParams<{ id: string }>()
  const { workers, skills, outcomes, activity, running } = useDemoWorkforce()

  const worker = useMemo(
    () => workers.find((w) => w.id === params.id),
    [workers, params.id],
  )
  const ownedSkills = useMemo(
    () => (worker ? skills.filter((s) => worker.skillIds.includes(s.id)) : []),
    [worker, skills],
  )
  const manager = useMemo(
    () => workers.find((w) => w.id === worker?.managerId),
    [workers, worker],
  )
  const workerOutcomes = useMemo(
    () => outcomes.filter((o) => o.workerId === params.id),
    [outcomes, params.id],
  )
  const workerActivity = useMemo(
    () => activity.filter((a) => a.workerId === params.id),
    [activity, params.id],
  )

  const [runTask, setRunTask] = useState("")

  if (!worker) {
    return (
      <div className="min-h-dvh bg-background bg-substrate text-foreground">
        <WorkforceNav />
        <main className="mx-auto max-w-[900px] px-5 py-16 text-center sm:px-8">
          <p className="text-muted-foreground">Worker not found.</p>
          <Link href="/workforce" className="mt-3 inline-block text-primary underline">
            Back to workforce
          </Link>
        </main>
      </div>
    )
  }

  const isRunning = running.includes(worker.id)
  const competence = workerCompetence(worker, skills)
  const stateMeta = WORKER_STATE_META[worker.state]
  const defaultTask = `Move ${worker.primaryKpi} this week.`

  function runSkill(skillId: string) {
    demoStore.runSkill(worker!.id, skillId, runTask.trim() || defaultTask)
  }

  return (
    <div className="min-h-dvh bg-background bg-substrate text-foreground">
      <WorkforceNav />
      <main className="mx-auto max-w-[1100px] px-5 py-6 sm:px-8">
        <Link
          href="/observatory"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Observatory
        </Link>

        {/* identity header */}
        <header className="mt-4 flex flex-wrap items-start gap-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-mono text-xl font-semibold"
            style={{ background: `${worker.accent}22`, color: worker.accent }}
          >
            {worker.initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{worker.name}</h1>
              <span
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em]"
                style={{
                  color:
                    stateMeta.tone === "warn"
                      ? "var(--color-warn)"
                      : stateMeta.tone === "good"
                        ? "var(--color-grow)"
                        : stateMeta.tone === "info"
                          ? "var(--color-primary)"
                          : "var(--color-muted-foreground)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "currentColor" }}
                />
                {isRunning ? "Working" : stateMeta.label}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {worker.title}
              {manager ? (
                <>
                  {" · reports to "}
                  <Link href={`/workforce/${manager.id}`} className="hover:text-foreground">
                    {manager.name}
                  </Link>
                </>
              ) : (
                " · Division lead"
              )}
            </p>
            <p className="mt-2 max-w-2xl text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {worker.mandate}
            </p>
          </div>

          <div className="flex gap-5">
            <Stat label="Competence" value={`${competence}%`} />
            <Stat label="Skills" value={String(ownedSkills.length)} />
            <Stat label="Autonomy" value={worker.autonomy} mono />
          </div>
        </header>

        {/* run panel */}
        <section className="mt-6 rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Put {worker.name.split(" ")[0]} to work
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={runTask}
              onChange={(e) => setRunTask(e.target.value)}
              placeholder={defaultTask}
              className="flex-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => runSkill(ownedSkills[0]?.id)}
              disabled={isRunning || !ownedSkills.length}
              className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/16 disabled:opacity-60"
            >
              {isRunning ? "Working…" : "Run top skill"}
            </button>
          </div>
        </section>

        {/* skills-as-IP */}
        <section className="mt-6">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Skills — owned as IP
          </h2>
          <div className="grid gap-3">
            {ownedSkills.map((s) => (
              <SkillCard
                key={s.id}
                skill={s}
                inheritedFromWorker={workers.find((w) => w.id === s.inheritedFrom)}
                running={isRunning}
                onRun={() => runSkill(s.id)}
              />
            ))}
          </div>
        </section>

        {/* outcomes + activity */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <OutcomeLedger outcomes={workerOutcomes} workers={workers} />
          </section>
          <aside className="flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <ActivityFeed activity={workerActivity} workers={workers} />
          </aside>
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-right">
      <div className={`text-lg font-semibold tabular-nums text-foreground ${mono ? "font-mono text-sm uppercase" : ""}`}>
        {value}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

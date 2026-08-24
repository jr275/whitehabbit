"use client"

/* ------------------------------------------------------------------ *
 * /approvals — the human-in-the-loop gate.
 *
 * High-risk steps (spend, publish, send) pause the worker and wait
 * here for a decision. Approving resumes the exact run that is blocked;
 * denying aborts it with no changes. The queue is driven by real run
 * state in the demo store, not a mock list.
 * ------------------------------------------------------------------ */

import { useMemo, useState } from "react"
import Link from "next/link"
import { WorkforceNav } from "@/components/workforce/nav"
import { demoStore, useDemoWorkforce } from "@/lib/workforce-demo/store"
import type { ApprovalRequest } from "@/lib/workforce-demo/model"

const GATE_RE = /approval|publish|financial|budget|send/i

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  return `${m}m ago`
}

export default function ApprovalsPage() {
  const { workers, skills, approvals } = useDemoWorkforce()
  const [busy, setBusy] = useState(false)

  const pending = approvals.filter((a) => a.status === "pending")
  const decided = approvals.filter((a) => a.status !== "pending").slice(0, 12)

  /** A worker whose primary skill carries a high-risk step — the
   * honest place a human gate belongs. */
  const gatedTarget = useMemo(() => {
    for (const w of workers) {
      const skill = skills.find((s) => w.skillIds.includes(s.id) && s.recipe.some((r) => GATE_RE.test(`${r.action} ${r.tool ?? ""}`)))
      if (skill) return { worker: w, skill }
    }
    return null
  }, [workers, skills])

  async function triggerGatedRun() {
    if (!gatedTarget) return
    setBusy(true)
    // fire-and-forget: the run will block in the queue until decided
    demoStore
      .runSkill(gatedTarget.worker.id, gatedTarget.skill.id, "Q4 budget reallocation across paid channels")
      .finally(() => setBusy(false))
  }

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Human-in-the-loop</p>
            <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-foreground">Approvals</h1>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
              Workers act autonomously until a step carries real risk — spending budget, publishing, sending. Those
              pause here for a human. Approving resumes the blocked run; denying stops it with no changes made.
            </p>
          </div>
          {gatedTarget && (
            <button
              onClick={triggerGatedRun}
              disabled={busy}
              className="rounded-lg border border-border bg-card px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
            >
              {busy ? "Run in flight…" : `Trigger a gated run · ${gatedTarget.worker.name}`}
            </button>
          )}
        </header>

        {/* pending queue */}
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {pending.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn/60" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${pending.length ? "bg-warn" : "bg-muted"}`} />
            </span>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Awaiting decision · {pending.length}
            </h2>
          </div>

          <div className="mt-3 space-y-3">
            {pending.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nothing waiting. Trigger a gated run to see the workforce pause for sign-off.
                </p>
              </div>
            )}
            {pending.map((a) => (
              <PendingCard key={a.id} req={a} workerName={workers.find((w) => w.id === a.workerId)?.name ?? "Worker"} />
            ))}
          </div>
        </section>

        {/* decision history */}
        {decided.length > 0 && (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recent decisions</h2>
            <div className="mt-3 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/50">
              {decided.map((a) => {
                const worker = workers.find((w) => w.id === a.workerId)
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-semibold ${
                        a.status === "approved" ? "bg-grow/15 text-grow" : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {a.status === "approved" ? "OK" : "NO"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        <Link href={`/workforce/${a.workerId}`} className="font-medium hover:text-primary">
                          {worker?.name}
                        </Link>{" "}
                        · {a.action}
                      </p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {a.status}
                        {a.auto ? " · auto (pulse)" : ""} · {a.decidedAt ? timeAgo(a.decidedAt) : ""}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function PendingCard({ req, workerName }: { req: ApprovalRequest; workerName: string }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-warn">
              High risk
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{timeAgo(req.requestedAt)}</span>
          </div>
          <p className="mt-2 text-base font-medium text-foreground">{req.action}</p>
          <p className="mt-1 text-sm text-muted-foreground">{req.reason}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            <Link href={`/workforce/${req.workerId}`} className="font-medium text-foreground hover:text-primary">
              {workerName}
            </Link>{" "}
            is blocked mid-run on “{req.task}”.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => demoStore.resolveApproval(req.id, false)}
            className="rounded-lg border border-border px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            Deny
          </button>
          <button
            onClick={() => demoStore.resolveApproval(req.id, true)}
            className="rounded-lg bg-primary px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
